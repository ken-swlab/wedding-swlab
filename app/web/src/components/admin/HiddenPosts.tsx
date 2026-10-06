"use client";

import { useState } from "react";
import { postJson } from "@/lib/api-client";
import { useAdminHiddenPosts } from "@/hooks/useHiddenItems";

/**
 * 非表示にした投稿の一覧と「戻す」（Issue #68）。
 * 非表示にする操作は、ゲストブックで投稿の詳細を開いたときの「非表示にする（管理者）」から行う。
 * 戻すと、投稿とそのコメントが元の公開範囲で見えるようになる（/api/admin/posts/visibility）。
 */
export function HiddenPosts({ enabled }: { enabled: boolean }) {
  const { posts, loading } = useAdminHiddenPosts(enabled);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore(postId: string) {
    if (!confirm("この投稿とコメントを元に戻します。よろしいですか？")) return;
    setBusy(postId);
    setError(null);
    try {
      await postJson("/api/admin/posts/visibility", { postId, hidden: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "戻せませんでした");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="h-16 animate-pulse rounded-xl bg-stone-200/60" />;
  if (posts.length === 0) {
    return <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-400">非表示にした投稿はありません</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      {error && <p role="alert" className="border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <ul className="divide-y divide-stone-100">
        {posts.map((p) => (
          <li key={p.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-stone-500">
                {p.authorName}
                {p.createdAt && ` · ${p.createdAt.toDate().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                {p.media.length > 0 && ` · 写真・動画 ${p.media.length}`}
                {p.commentCount > 0 && ` · コメント ${p.commentCount}`}
              </p>
              <p className="mt-0.5 line-clamp-2 break-words text-stone-800">{p.text || "（本文なし）"}</p>
            </div>
            <button
              type="button"
              disabled={busy === p.id}
              onClick={() => void restore(p.id)}
              className="shrink-0 rounded-md border border-stone-200 px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            >
              {busy === p.id ? "…" : "戻す"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
