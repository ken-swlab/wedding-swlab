"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Post } from "@/types";
import { thumbSrc } from "@/lib/media-url";
import {
  canShareFiles,
  downloadFiles,
  externalBrowserUrl,
  fetchPhoto,
  flattenPhotos,
  isLineBrowser,
  type PhotoEntry,
} from "@/lib/photo-save";
import {
  PICKER_PRELOAD_MARGIN_PX,
  SAVE_BATCH_MAX_BYTES,
  SAVE_BATCH_MAX_FILES,
} from "@/config/guestbook";

/**
 * ギャラリーの「保存する写真を選ぶ」モード。
 *
 * ★ここだけは投稿ではなく写真1枚ずつ並べる★
 *   ふだんのギャラリーは投稿単位（GalleryGrid の★参照。いいねが投稿単位のため）だが、
 *   保存では「複数枚の投稿」を意識させず、4枚の投稿も4マスに分けて平等に選べるようにする。
 * ★選べるのは画面に出ている写真だけ★
 *   顔・文字の絞り込みは解除しない（posts は絞り込み後の一覧を受け取る）。絞り込みを変えて
 *   見えなくなった写真は選択からも外す。過去の写真は下までスクロールすると自動で読み込む。
 * ★下部の操作バーと保存ダイアログは document.body へ Portal で出す★
 *   このコンポーネントは PullToRefresh の本文の中に描かれ、引っ張っている間は本文に transform と
 *   pointer-events: none が付く（PullToRefresh の★参照）。中に置いたままだと fixed が画面に固定されず、
 *   z-50 も本文の重なりの単位に閉じ込められてボトムナビ（z-40）の下に潜り、ボタンも押せなくなる。
 */
export function PhotoPicker({
  posts,
  hasMore,
  loadingMore,
  loadMore,
  onExit,
}: {
  posts: Post[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  onExit: () => void;
}) {
  const photos = useMemo(() => flattenPhotos(posts), [posts]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState<PhotoEntry[] | null>(null);

  // 表示から外れた写真は選択からも外す（見えていない写真を保存しない）
  const visible = useMemo(() => new Set(photos.map((p) => p.key)), [photos]);
  if ([...selected].some((k) => !visible.has(k))) {
    setSelected(new Set([...selected].filter((k) => visible.has(k))));
  }

  const allSelected = photos.length > 0 && selected.size === photos.length;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // --- 下までスクロールしたら過去の写真を読み込む ---
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loadingMore) return;
    // ★読み込みが終わるたびに作り直す★ 絞り込み中は1回の読み込みで写真が増えないことがあり、
    //   目印が見えたままだと IntersectionObserver は再び知らせてこない。作り直せば最初に1回知らせる
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: `0px 0px ${PICKER_PRELOAD_MARGIN_PX}px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  const portalReady = useIsClient();

  const startSave = useCallback(() => {
    setSaving(photos.filter((p) => selected.has(p.key)));
  }, [photos, selected]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <p className="flex-1 text-sm text-stone-600">保存する写真を選んでください</p>
        <button
          type="button"
          onClick={onExit}
          className="min-h-11 touch-manipulation rounded-full px-4 text-sm text-stone-500 transition hover:bg-stone-100"
        >
          キャンセル
        </button>
      </div>

      {photos.length === 0 && !hasMore ? (
        <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-400">
          保存できる写真がありません。
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-xl bg-stone-200">
          {photos.map((p) => {
            const on = selected.has(p.key);
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => toggle(p.key)}
                aria-pressed={on}
                aria-label={`${p.post.authorName}さんの写真${on ? "（選択中）" : ""}`}
                className="relative aspect-square touch-manipulation bg-stone-100"
              >
                <Image
                  src={thumbSrc(p.media)}
                  alt=""
                  fill
                  sizes="33vw"
                  className={`object-cover transition duration-150 ${on ? "scale-[0.92] rounded-md" : ""}`}
                />
                <span
                  aria-hidden
                  className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                    on
                      ? "border-white bg-sky-500 text-white shadow"
                      : "border-white/90 bg-black/15 text-transparent"
                  }`}
                >
                  ✓
                </span>
              </button>
            );
          })}
          {/* 読み込み中は灰色のマスを並べ、続きがあることを見せる */}
          {loadingMore &&
            Array.from({ length: 6 }, (_, i) => (
              <div key={`loading-${i}`} className="aspect-square animate-pulse bg-stone-200" />
            ))}
        </div>
      )}

      <div ref={sentinel} className="flex h-16 items-center justify-center text-xs text-stone-400">
        {loadingMore ? (
          <span className="flex items-center gap-2" role="status">
            <span
              aria-hidden
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700"
            />
            過去の写真を読み込んでいます…
          </span>
        ) : hasMore ? null : photos.length > 0 ? (
          "すべての写真を表示しました"
        ) : null}
      </div>

      {/* 選択中の操作。ボトムナビの上に重ねる（選択モードの間はナビの代わり） */}
      {portalReady &&
        createPortal(
          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
            <div className="mx-auto flex h-16 max-w-xl items-center gap-2 px-4">
              <button
                type="button"
                onClick={() => setSelected(allSelected ? new Set() : new Set(photos.map((p) => p.key)))}
                disabled={photos.length === 0}
                className="min-h-11 touch-manipulation rounded-full px-3 text-sm text-sky-700 transition hover:bg-sky-50 disabled:opacity-40"
              >
                {allSelected ? "すべて解除" : "すべて選択"}
              </button>
              <p className="flex-1 text-center text-sm tabular-nums text-stone-600" aria-live="polite">
                {selected.size > 0 ? `${selected.size}枚を選択中` : "写真を選択"}
              </p>
              <button
                type="button"
                onClick={startSave}
                disabled={selected.size === 0}
                className="min-h-11 touch-manipulation rounded-full bg-stone-900 px-5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
              >
                保存
              </button>
            </div>
          </div>,
          document.body,
        )}

      {saving &&
        portalReady &&
        createPortal(
          <SaveDialog
            photos={saving}
            onClose={(done) => {
              setSaving(null);
              if (done) setSelected(new Set());
            }}
          />,
          document.body,
        )}
    </div>
  );
}

const noopSubscribe = () => () => {};

/** Portal の出し先（document.body）があるか。サーバーとハイドレーション中は false */
function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

type Phase =
  | { kind: "loading"; batch: number }
  | { kind: "ready"; batch: number; files: File[] }
  | { kind: "done" };

/**
 * 保存の進み具合。写真を少しずつ読み込み、共有シート（またはダウンロード）へ渡す。
 * ★共有シートは利用者のタップの中でしか開けない★
 *   読み込みを待ってから開こうとするとブラウザに拒否されるので、読み込みが済んだら
 *   「保存」ボタンを出し、そのタップで開く。次の分はシートを閉じてから読み込む。
 */
function SaveDialog({ photos, onClose }: { photos: PhotoEntry[]; onClose: (done: boolean) => void }) {
  const [share] = useState(canShareFiles);
  const [line] = useState(isLineBrowser);
  const [queue, setQueue] = useState(photos);
  const [cursor, setCursor] = useState(0);
  const [saved, setSaved] = useState(0);
  const [failed, setFailed] = useState<PhotoEntry[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "loading", batch: 1 });
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  // まとまりの数は読み込むまで分からない（バイト数で切るため）。枚数からの見込みを出す
  const batches = Math.max(1, Math.ceil(queue.length / SAVE_BATCH_MAX_FILES));

  // --- 次のまとまりを読み込む ---
  useEffect(() => {
    if (phase.kind !== "loading") return;
    let alive = true;
    void (async () => {
      const files: File[] = [];
      let bytes = 0;
      let i = cursor;
      const missed: PhotoEntry[] = [];
      while (i < queue.length && files.length < SAVE_BATCH_MAX_FILES && bytes < SAVE_BATCH_MAX_BYTES) {
        try {
          const f = await fetchPhoto(queue[i]);
          files.push(f);
          bytes += f.size;
        } catch (e) {
          console.error(e);
          missed.push(queue[i]);
        }
        i += 1;
        if (!alive || cancelled.current) return;
        setCursor(i);
      }
      if (missed.length) setFailed((prev) => [...prev, ...missed]);
      if (files.length === 0) {
        setPhase(i < queue.length ? { kind: "loading", batch: phase.batch } : { kind: "done" });
        return;
      }
      if (share) {
        setPhase({ kind: "ready", batch: phase.batch, files });
        return;
      }
      // 共有シートが無い端末（PC など）は、読み込んだ分をそのままダウンロードさせる
      await downloadFiles(files);
      if (!alive || cancelled.current) return;
      setSaved((n) => n + files.length);
      setPhase(i < queue.length ? { kind: "loading", batch: phase.batch + 1 } : { kind: "done" });
    })();
    return () => {
      alive = false;
    };
    // cursor は読み込みの中で進めるので、依存に入れると読み込みが二重に走る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, queue, share]);

  async function onShare() {
    if (phase.kind !== "ready") return;
    setError(null);
    try {
      await navigator.share({ files: phase.files });
    } catch (e) {
      // 共有シートを閉じただけ（AbortError）なら、同じ分をもう一度出せるようにする
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.error(e);
      setError("共有シートを開けませんでした。もう一度お試しください。");
      return;
    }
    setSaved((n) => n + phase.files.length);
    setPhase(cursor < queue.length ? { kind: "loading", batch: phase.batch + 1 } : { kind: "done" });
  }

  function retryFailed() {
    setQueue(failed);
    setFailed([]);
    setCursor(0);
    setPhase({ kind: "loading", batch: 1 });
  }

  function close() {
    cancelled.current = true;
    onClose(phase.kind === "done" && failed.length === 0);
  }

  const total = queue.length;
  const progress = phase.kind === "done" ? total : cursor;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="写真の保存"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <h2 className="text-base font-semibold text-stone-900">写真を保存</h2>

        {line && !share && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            LINE のブラウザでは写真アプリに保存できないことがあります。うまくいかないときは、
            Safari などのブラウザで開いてお試しください。
            <a
              href={externalBrowserUrl()}
              className="mt-2 block font-medium text-amber-900 underline underline-offset-4"
            >
              ブラウザで開く
            </a>
          </div>
        )}

        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-sky-600 transition-[width] duration-300"
              style={{ width: `${Math.max(3, (progress / Math.max(1, total)) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-sm tabular-nums text-stone-600" role="status">
            {phase.kind === "loading" && `写真を準備しています… ${progress} / ${total}`}
            {phase.kind === "ready" &&
              `${phase.files.length}枚の準備ができました（${phase.batch} / ${Math.max(batches, phase.batch)}）`}
            {phase.kind === "done" && `${saved}枚を保存しました`}
          </p>
          {failed.length > 0 && (
            <p className="mt-1 text-sm text-rose-700" role="alert">
              {failed.length}枚は読み込めませんでした。
            </p>
          )}
          {error && (
            <p className="mt-1 text-sm text-rose-700" role="alert">
              {error}
            </p>
          )}
          {phase.kind === "ready" && (
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
              ボタンを押して、開いたメニューで「画像を保存」を選んでください。
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          {phase.kind === "ready" && (
            <button
              type="button"
              onClick={() => void onShare()}
              className="min-h-11 touch-manipulation rounded-full bg-stone-900 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              {phase.files.length}枚を保存する
            </button>
          )}
          {phase.kind === "done" && failed.length > 0 && (
            <button
              type="button"
              onClick={retryFailed}
              className="min-h-11 touch-manipulation rounded-full border border-stone-200 text-sm text-stone-700 transition hover:bg-stone-100"
            >
              読み込めなかった{failed.length}枚をやり直す
            </button>
          )}
          <button
            type="button"
            onClick={close}
            className="min-h-11 touch-manipulation rounded-full text-sm text-stone-500 transition hover:bg-stone-100"
          >
            {phase.kind === "done" ? "閉じる" : "やめる"}
          </button>
        </div>
      </div>
    </div>
  );
}
