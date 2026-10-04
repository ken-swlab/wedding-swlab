"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { attachOriginal, markOriginalFailed, uploadOriginal } from "@/lib/media";
import {
  addJobs,
  deleteJob,
  isQuotaError,
  listJobs,
  readPayload,
  requestPersist,
  resetStuckJobs,
  updateJob,
  type NewJob,
  type QueuedJob,
} from "@/lib/upload-queue";

export type UploadJob = QueuedJob & { progress: number };

/** Composer から渡ってくる形。互換性のため従来どおり File を受ける */
export type EnqueueItem = {
  postId: string;
  thumbPath: string;
  originalPath: string;
  fileName: string;
  bytes: number;
  file: File;
};

/**
 * 送る直前に、その1枚ぶんだけ実体を取り出して Blob に組み立てる。
 *
 * ★関数に切り出す理由★
 *   呼び出し側で null 許容の変数を持ち回すと、try/catch/finally が
 *   入り組んで構文を壊しやすい。ここで投げれば、呼び出し側は
 *   ひとつの try/catch で「読めない」も「送れない」も同じ扱いにできる。
 */
async function loadBlob(job: QueuedJob): Promise<Blob> {
  const buffer = await readPayload(job.id);
  if (!buffer) throw new Error("端末に写真の実体が残っていません");
  if (buffer.byteLength !== job.bytes) {
    throw new Error(`写真が壊れています（${buffer.byteLength} / ${job.bytes} バイト）`);
  }
  return new Blob([buffer], { type: job.mimeType });
}

/**
 * 原本の送信キュー。
 *
 * ★自動では絶対に送らない★
 *   会場のネットワークは参列者全員で奪い合う。さらにブラウザからは
 *   「Wi-Fi のときだけ送る」を確実に判定できない。したがって発火点は
 *   ユーザーが押す start() ただ1つに限定する。
 *
 * 送信は並列ではなく直列。1人が帯域を占有しないようにするため。
 */
/**
 * ★このタブで送信ループが動いている uid★
 *   フックのインスタンスではなくモジュールで持つ。画面を移ってフックが作り直されても、
 *   前のインスタンスの送信（実行中の1枚）は最後まで走る。そのあいだに
 *   新しいインスタンスが resetStuckJobs で uploading を queued に戻したり、
 *   start() で2本目のループを始めたりすると、同じ原本を二重に送ってしまう。
 */
const activeLoops = new Set<string>();

export function useUpload(uid?: string) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [running, setRunning] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const progressRef = useRef<Record<string, number>>({});
  const runningRef = useRef(false);
  // アンマウントされたら、実行中の1枚を送り終えたところでループを止める
  const stopRef = useRef(false);
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const refresh = useCallback(async () => {
    const u = uidRef.current;
    if (!u) {
      setJobs([]);
      return;
    }
    try {
      const list = await listJobs(u);
      setJobs(list.map((j) => ({ ...j, progress: progressRef.current[j.id] ?? 0 })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "一時保存の読み込みに失敗しました");
    }
  }, []);

  // マウント時: 送信中のまま中断されたものを queued に戻してから復元する
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void (async () => {
      try {
        // 送信中のジョブを queued に戻すのは、このタブでループが動いていないときだけ
        if (!activeLoops.has(uid)) await resetStuckJobs(uid);
      } catch {
        /* 読めないだけなら続行する */
      }
      if (!alive) return;
      await refresh();
      if (alive) setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, [uid, refresh]);

  // 他のタブで送信された場合や、バックグラウンドから復帰した場合に数え直す
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && !runningRef.current) void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const enqueue = useCallback(
    (items: EnqueueItem[]) => {
      const u = uidRef.current;
      if (!u || items.length === 0) return;

      void (async () => {
        try {
          void requestPersist();

          // ★直列で読む★ Promise.all だと複数枚ぶんのバイト列を同時に確保することになり、
          //   iOS のメモリ上限に近づく。1枚ずつ取り込む。
          const payload: NewJob[] = [];
          for (const i of items) {
            payload.push({
              uid: u,
              postId: i.postId,
              thumbPath: i.thumbPath,
              originalPath: i.originalPath,
              fileName: i.fileName,
              mimeType: i.file.type || "application/octet-stream",
              bytes: i.bytes,
              // Blob のまま入れず、純粋なバイト列で保存する。
              // WebKit では IndexedDB 内の Blob の実体参照が
              // 再読み込み後に失効することがあるため。
              buffer: await i.file.arrayBuffer(),
            });
          }

          await addJobs(payload);
          // ★ここで送信は始めない★ 発火点は start() だけ
          await refresh();
        } catch (e) {
          setError(
            isQuotaError(e)
              ? "端末の空き容量が足りず、高画質版を保存できませんでした。先に「本アップロードを開始」で送信してからお試しください。"
              : e instanceof Error
                ? e.message
                : "写真の一時保存に失敗しました",
          );
        }
      })();
    },
    [refresh],
  );

  const start = useCallback(() => {
    const u = uidRef.current;
    if (!u || runningRef.current || activeLoops.has(u)) return;
    activeLoops.add(u);
    runningRef.current = true;
    setRunning(true);
    setError("");
    setSentCount(0);

    void (async () => {
      try {
        for (;;) {
          if (stopRef.current) break;
          const list = await listJobs(u);
          const next = list.find((j) => j.status === "queued");
          if (!next) break;

          await updateJob(next.id, { status: "uploading", error: undefined });
          progressRef.current[next.id] = 0;
          await refresh();

          try {
            // blob はこのブロック内だけのローカル。
            // 1件終わればスコープを抜けて解放される。
            const blob = await loadBlob(next);

            const result = await uploadOriginal(next.originalPath, blob, (r) => {
              progressRef.current[next.id] = r;
              setJobs((prev) =>
                prev.map((j) => (j.id === next.id ? { ...j, progress: r } : j)),
              );
            });
            await attachOriginal(next.postId, next.thumbPath, result);

            // 成功したら端末から消す。残すとストレージを食い潰す
            delete progressRef.current[next.id];
            await deleteJob(next.id);
            setSentCount((n) => n + 1);
          } catch (e) {
            await updateJob(next.id, {
              status: "failed",
              error: e instanceof Error ? e.message : "送信に失敗しました",
            });
            // 記録自体が失敗しても握りつぶす（キューの消化は続ける）
            await markOriginalFailed(next.postId, next.thumbPath).catch(() => {});
          }

          await refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "アップロードを継続できませんでした");
      } finally {
        activeLoops.delete(u);
        runningRef.current = false;
        setRunning(false);
        await refresh();
      }
    })();
  }, [refresh]);

  const retryFailed = useCallback(() => {
    const u = uidRef.current;
    if (!u || runningRef.current) return;
    void (async () => {
      const list = await listJobs(u);
      for (const j of list.filter((x) => x.status === "failed")) {
        await updateJob(j.id, { status: "queued", error: undefined });
      }
      await refresh();
      start();
    })();
  }, [refresh, start]);

  /**
   * ★アンマウントで送信ループを止める★
   *   /guestbook 以下から出ていくのは、承認の取り消しや停止で (guest)/layout.tsx に
   *   送り出されたときだけ。そこで裏の送信を続けると画面から見えなくなる。
   *   実行中の1枚は送り終えてから止まり、残りは queued のまま端末に残る。
   *   開発時の StrictMode は effect を2回走らせるので、本体で false に戻す。
   */
  useEffect(() => {
    stopRef.current = false;
    return () => {
      stopRef.current = true;
    };
  }, []);

  /**
   * 離脱警告は「送信中」だけに限る。
   * 手動方式では未送信のまま閉じるのが正常な状態なので、
   * 待機件数で警告すると毎回ダイアログが出て邪魔になる。
   */
  useEffect(() => {
    if (!running) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [running]);

  const pending = jobs.filter((j) => j.status === "queued" || j.status === "uploading");
  const failed = jobs.filter((j) => j.status === "failed");
  const current = jobs.find((j) => j.status === "uploading") ?? null;

  return {
    jobs,
    pending,
    failed,
    current,
    /** 送信が必要な残り件数（失敗ぶんも含む） */
    remaining: pending.length + failed.length,
    remainingBytes: [...pending, ...failed].reduce((n, j) => n + j.bytes, 0),
    running,
    sentCount,
    error,
    // 未ログインなら復元するものが無いので、読み込み済みとして扱う（以前と同じ）
    hydrated: !uid || hydrated,
    enqueue,
    start,
    retryFailed,
    refresh,
  };
}

export type UploadApi = ReturnType<typeof useUpload>;
