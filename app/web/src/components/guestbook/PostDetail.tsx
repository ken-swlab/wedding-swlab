"use client";

import type { User } from "firebase/auth";
import { usePost } from "@/hooks/usePost";
import { useGuestbookData } from "./GuestbookDataProvider";
import { PostCard } from "./PostCard";
import { PlaceholderPanel } from "./GuestbookShell";

/**
 * 投稿の詳細（戻るボタン + コメント欄つきのカード）。
 * 詳細画面（URL を直接開いたとき）と、タイムラインから開くシートの両方で使う。
 */
export function PostDetail({ id, user, onBack }: { id: string; user: User; onBack: () => void }) {
  // 一覧にある投稿はそれをすぐ出す（いいね数などはその購読で更新される）。
  // 共有 URL を直接開いたときのように一覧に無いときだけ、1件を購読する。
  const { posts } = useGuestbookData();
  const cached = posts.find((p) => p.id === id) ?? null;
  const remote = usePost(id, !cached);
  const post = cached ?? remote.post;
  const loading = !cached && remote.loading;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 touch-manipulation items-center gap-1 rounded-full px-3 text-sm text-stone-500 transition hover:bg-stone-100"
      >
        <span aria-hidden>‹</span> 戻る
      </button>

      {loading ? (
        <div data-post-detail className="h-40 animate-pulse rounded-2xl bg-stone-200/60" />
      ) : post ? (
        <PostCard post={post} user={user} variant="detail" />
      ) : (
        <div data-post-detail>
          <PlaceholderPanel title="投稿が見つかりません">
            削除されたか、表示できない投稿です。
          </PlaceholderPanel>
        </div>
      )}
    </div>
  );
}
