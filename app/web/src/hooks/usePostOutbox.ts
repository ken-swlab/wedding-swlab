"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { postJson } from "@/lib/api-client";
import { feedSrc, posterSrc } from "@/lib/media-url";
import { MENTION_NOTIFY_API } from "@/config/mentions";
import { OUTBOX_PRELOAD_TIMEOUT_MS, POSTED_TOAST_MS } from "@/config/guestbook";
import { emptyProgress, stepCount, type PostDraft, type SendProgress } from "@/lib/post-draft";
import type { EnqueueItem } from "@/hooks/useUpload";
import type { MediaItem } from "@/types";

/** 投稿したあとの知らせ（ComposerSheet のトースト） */
/** sub … 2行目（小さく出す）。ms … 出しておく時間（無ければ COMPOSER_TOAST_MS） */
export type OutboxNotice = { kind: "upload" | "episode" | "couple" | "error"; text: string; sub?: string; ms?: number };

export type OutboxEntry = {
  draft: PostDraft;
  /** sending: 送っている / failed: 送れなかった（もう一度送る・取り消す）/ sent: 書けた（本物の写真を読み込み中） */
  status: "sending" | "failed" | "sent";
  /** 済んだ手順の数と全体（進み具合の線） */
  done: number;
  total: number;
  error?: string;
};

export type PostOutbox = {
  entries: OutboxEntry[];
  /** 「投稿する」。すぐ返る（送信は裏で続く） */
  submit: (draft: PostDraft) => void;
  retry: (postId: string) => void;
  cancel: (postId: string) => void;
};

/**
 * 送信の列（Issue #254）。「投稿する」を押したら、投稿画面を閉じてここで送り続ける。
 *
 * ★送信中の投稿は自分にだけ見える★ 投稿のデータ（Firestore）を書くのは写真を送り終えてから（今までと同じ順番）。
 *   それまでほかの人には何も届かない。タイムラインには、端末の中の写真と本文で先に出す（PendingPostCard）。
 * ★送れなくてもタイムラインから勝手に消さない★「もう一度送る」「取り消す」を出し、電波が戻ったら（online）自動でもう一度送る。
 *   やり直しは続きから（送り終わった写真は送り直さない。SendProgress）。
 * ★入れ替えは、本物の写真が読めてから★ 書けたら（sent）一覧用の写真を先に読み込み、読めたら（か時間切れで）
 *   列から外す。外すまで、タイムラインは同じ ID の本物の投稿の代わりに、送信中の投稿を出し続ける（写真が一瞬消えない）。
 * ★アプリを閉じると、送信中の投稿は消える★ 端末に保存していない（PR に書いた）。送っている間は、閉じる前に確認を出す。
 * 書けたあとの処理（メンションの通知・顔検出・高画質版の列・エピソード）は、今までの Composer と同じ。
 */
export function usePostOutbox({
  enqueue,
  notify,
  onPhotosPosted,
}: {
  enqueue: (items: EnqueueItem[]) => void;
  notify: (n: OutboxNotice) => void;
  /** 写真付きの投稿が書けたとき（高画質版を列に入れたあと）。初回の説明を出す（Issue #272。PhotoIntroSheet） */
  onPhotosPosted?: () => void;
}): PostOutbox {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  // 電波が戻ったときに、いまの列を読む（state の更新関数の中で送り始めない）
  const latest = useRef<OutboxEntry[]>([]);
  useEffect(() => {
    latest.current = entries;
  }, [entries]);
  // 途中経過（やり直しで続きから送る）と、いま送っているか。描画に要らないので ref で持つ
  const progress = useRef(new Map<string, SendProgress>());
  const running = useRef(new Set<string>());
  const drafts = useRef(new Map<string, PostDraft>());

  const patch = useCallback((postId: string, p: Partial<OutboxEntry>) => {
    setEntries((list) => list.map((e) => (e.draft.postId === postId ? { ...e, ...p } : e)));
  }, []);

  /** 列から外し、端末の写真の URL を解放する */
  const drop = useCallback((postId: string) => {
    const draft = drafts.current.get(postId);
    draft?.items.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    drafts.current.delete(postId);
    progress.current.delete(postId);
    setEntries((list) => list.filter((e) => e.draft.postId !== postId));
  }, []);

  const run = useCallback(
    async (postId: string) => {
      const draft = drafts.current.get(postId);
      if (!draft || running.current.has(postId)) return;
      running.current.add(postId);
      const prog = progress.current.get(postId) ?? emptyProgress(draft);
      progress.current.set(postId, prog);
      patch(postId, { status: "sending", error: undefined });
      try {
        // ★送信の処理は、送るときに読む★（画像の処理・アップロードの部品を最初の JS に入れない）
        const { sendDraft } = await import("@/lib/post-send");
        await sendDraft(draft, prog, (done) => patch(postId, { done }));
      } catch (e) {
        console.warn("[outbox] 投稿を送れませんでした", e);
        patch(postId, { status: "failed", error: e instanceof Error ? e.message : "送れませんでした" });
        running.current.delete(postId);
        return;
      }
      running.current.delete(postId);
      patch(postId, { status: "sent" });
      afterPosted(draft, prog, { enqueue, notify, onPhotosPosted });

      // 新郎新婦あては自分のタイムラインに出ないので、入れ替えを待たずに外す
      if (draft.coupleOnly) {
        drop(postId);
        return;
      }
      await preload(prog.media.filter((m): m is MediaItem => !!m));
      drop(postId);
    },
    [drop, enqueue, notify, onPhotosPosted, patch],
  );

  const submit = useCallback(
    (draft: PostDraft) => {
      drafts.current.set(draft.postId, draft);
      setEntries((list) => [{ draft, status: "sending", done: 0, total: stepCount(draft) }, ...list]);
      void run(draft.postId);
    },
    [run],
  );

  const retry = useCallback((postId: string) => void run(postId), [run]);

  const cancel = useCallback(
    (postId: string) => {
      // 送っている最中は取り消さない（送れなかったときだけ出すボタン）
      if (running.current.has(postId)) return;
      drop(postId);
    },
    [drop],
  );

  // 電波が戻ったら、送れなかった投稿をもう一度送る
  useEffect(() => {
    function onOnline() {
      for (const e of latest.current) if (e.status === "failed") void run(e.draft.postId);
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [run]);

  // 送っている・送れなかった投稿があるあいだは、ページを閉じる前に確かめる（端末に保存していないので消える）
  const unsent = entries.some((e) => e.status !== "sent");
  useEffect(() => {
    if (!unsent) return;
    function onBeforeUnload(ev: BeforeUnloadEvent) {
      ev.preventDefault();
      ev.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsent]);

  return { entries, submit, retry, cancel };
}

/**
 * 投稿のデータが書けたあと（今までの Composer の処理と同じ。どれも投稿そのものは止めない）:
 * メンションの通知 → 新郎新婦あての知らせ → 顔検出 → 高画質版の列 → エピソード。
 */
function afterPosted(
  draft: PostDraft,
  prog: SendProgress,
  { enqueue, notify, onPhotosPosted }: { enqueue: (items: EnqueueItem[]) => void; notify: (n: OutboxNotice) => void; onPhotosPosted?: () => void },
) {
  const postId = draft.postId;
  // メンションの通知。★待たない★ 相手に見えるかは、サーバーが保存済みの投稿で確かめる（/api/notifications/mention）
  if (draft.mentioned.length > 0) {
    void postJson(MENTION_NOTIFY_API, { postId }).catch((e) => console.error(e));
  }
  // 新郎新婦あての投稿は、投稿者のタイムラインには出ない。届いたことと、見られる場所を知らせる
  if (draft.coupleOnly) notify({ kind: "couple", text: "新郎新婦にだけ届きました。マイページで確認できます。" });

  // 顔検出の発火。★待たない★
  void (async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      await fetch("/api/faces/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ postId }),
      });
    } catch {
      /* 失敗しても投稿体験には影響させない */
    }
  })();

  // 高画質版は ★列に入れるだけ★ 送信の発火はゲストのボタン操作に委ねる
  const originals = prog.originals.filter((o): o is Omit<EnqueueItem, "postId"> => !!o);
  if (originals.length > 0) enqueue(originals.map((o) => ({ ...o, postId })));
  /**
   * ★写真付きの投稿は「投稿しました（軽量版）」を短く出す★（Issue #272。2.5 秒）
   *   高画質版が残っているときだけ、2行目に送るタイミングを添える。ゲストに見える言葉は「軽量版」「高画質版」だけ。
   *   写真が初めてなら、2回に分けている理由の説明（PhotoIntroSheet）も出す（高画質版がある投稿だけ）。
   */
  if (prog.media.some((m) => m?.type === "image")) {
    notify({
      kind: "upload",
      text: "投稿しました（軽量版）",
      sub: originals.length > 0 ? "高画質版は Wi-Fi のときに送ってください" : undefined,
      ms: POSTED_TOAST_MS,
    });
  }
  if (originals.length > 0) onPhotosPosted?.();

  // エピソード。★投稿の後に行う★ 失敗しても投稿は取り消さない
  if (draft.episode) {
    const photoUrls = prog.media.filter((m): m is MediaItem => m?.type === "image").map((m) => m.url);
    void postJson("/api/episodes", {
      theme: draft.episode.theme,
      // 投稿にもお題（promptId）を付けるため（サーバーが本人の投稿か確かめて付ける。Issue #284）
      postId,
      originalText: draft.text,
      photoUrls,
      visibleToTags: draft.visibleToTags,
    }).then(
      () => notify({ kind: "episode", text: "エピソードを受け付けました。新郎新婦の確認後に使われます 🌿" }),
      (e: unknown) =>
        notify({
          kind: "error",
          text: `投稿は完了しました。エピソードの登録だけ失敗しました（${e instanceof Error ? e.message : "不明なエラー"}）`,
        }),
    );
  }
}

/**
 * 一覧に出す本物の写真を先に読み込む（Issue #254）。読めたら、送信中の投稿を本物に入れ替える。
 * ★時間切れでも入れ替える★（OUTBOX_PRELOAD_TIMEOUT_MS）読めない写真で、いつまでも送信中のままにしない。
 * 動画は1枚目の画像があればそれ（一覧では動画本体を読まない。Issue #251）、無ければ待たない。
 */
function preload(media: MediaItem[]): Promise<void> {
  const srcs = media.flatMap((m) => {
    const src = m.type === "image" ? feedSrc(m) : posterSrc(m);
    return src ? [src] : [];
  });
  if (srcs.length === 0) return Promise.resolve();
  const each = srcs.map(
    (src) =>
      new Promise<void>((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = src;
      }),
  );
  return Promise.race([
    Promise.all(each).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, OUTBOX_PRELOAD_TIMEOUT_MS)),
  ]);
}
