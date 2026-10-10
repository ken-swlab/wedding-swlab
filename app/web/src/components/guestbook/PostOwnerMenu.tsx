"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { deletePost } from "@/lib/posts";
import type { Post } from "@/types";

/**
 * 自分の投稿の「⋯」（編集・削除）。マイページの自分の投稿一覧でだけ使う（Issue #94）。
 * タイムライン・ギャラリー・投稿の詳細には入口を置かない。
 *
 * ★削除は確認してから★ コメントといいねも消え、元に戻せない。
 * ★押せる要素はすべて button にする★ PostCard は button などへのタップを「カードを開く」として扱わない。
 */
export function PostOwnerMenu({
  post,
  onEdit,
  onDeleted,
}: {
  post: Post;
  onEdit: () => void;
  /** 削除が済んだあとに呼ぶ（一覧からの取り除き・送信待ちの片付け） */
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="relative -mr-2 -mt-2 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="この投稿の操作"
        className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full text-xl leading-none text-stone-400 transition hover:bg-stone-100"
      >
        <span aria-hidden>⋯</span>
      </button>
      {open && (
        <>
          {/* 外側のタップで閉じる */}
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-30 w-32 overflow-hidden rounded-2xl border border-stone-200/80 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className="flex min-h-11 w-full touch-manipulation items-center px-4 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              編集
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
              className="flex min-h-11 w-full touch-manipulation items-center px-4 text-left text-sm text-rose-600 hover:bg-rose-50"
            >
              削除
            </button>
          </div>
        </>
      )}
      {confirming && <DeleteDialog postId={post.id} onClose={() => setConfirming(false)} onDeleted={onDeleted} />}
    </div>
  );
}

/**
 * ★document.body へ Portal で出し、クリックを親へ伝えない★
 *   本文は引っ張って更新の間 transform が付く（PullToRefresh の★参照）。Portal の中のイベントも
 *   React の木ではカードへ伝わるので、止めないと背景のタップで投稿の詳細が開く。
 */
function DeleteDialog({
  postId,
  onClose,
  onDeleted,
}: {
  postId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 裏の画面を止める。PullToRefresh もこれを見て引っ張りを始めない
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function onConfirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deletePost(postId);
      onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除できませんでした");
      setBusy(false);
    }
  }

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="投稿の削除"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white px-6 pt-6 shadow-xl sm:rounded-2xl"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <p className="text-[15px] leading-relaxed text-stone-800">
          この投稿を削除します。コメントやいいねも消えます。元に戻せません。
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy}
            className="min-h-11 touch-manipulation rounded-full bg-rose-600 text-sm font-medium text-white transition hover:bg-rose-500 disabled:opacity-40"
          >
            {busy ? "削除しています…" : "削除する"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 touch-manipulation rounded-full text-sm text-stone-500 transition hover:bg-stone-100 disabled:opacity-40"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
