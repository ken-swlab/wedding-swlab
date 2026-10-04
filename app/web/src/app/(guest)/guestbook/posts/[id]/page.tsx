"use client";

import { useParams, useRouter } from "next/navigation";
import { useGuestSession } from "@/hooks/useGuestSession";
import { usePost } from "@/hooks/usePost";
import { PostCard } from "@/components/guestbook/PostCard";
import { AuthorNameProvider } from "@/components/guestbook/AuthorNameProvider";
import { GuestbookShell, PlaceholderPanel } from "@/components/guestbook/GuestbookShell";
import { SplashScreen } from "@/components/SplashScreen";
import { GUESTBOOK_PATHS } from "@/config/guestbook";
import { publicName } from "@/lib/names";

export default function PostDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useGuestSession();
  const { post, loading } = usePost(id);

  // ★振り分けは (guest)/layout.tsx が行う★ ここは承認済みで開ける状態だけを描く
  if (!user || !profile) return <SplashScreen phase="booting" />;

  function back() {
    // 共有された URL を直接開いたときは戻り先が無いので、タイムラインへ送る
    if (window.history.length > 1) router.back();
    else router.push(GUESTBOOK_PATHS.home);
  }

  return (
    <AuthorNameProvider value={publicName(profile)}>
      <GuestbookShell>
        <div className="space-y-3">
          <button
            type="button"
            onClick={back}
            className="inline-flex min-h-11 touch-manipulation items-center gap-1 rounded-full px-3 text-sm text-stone-500 transition hover:bg-stone-100"
          >
            <span aria-hidden>‹</span> 戻る
          </button>

          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-200/60" />
          ) : post ? (
            <PostCard post={post} user={user} variant="detail" />
          ) : (
            <PlaceholderPanel title="投稿が見つかりません">
              削除されたか、表示できない投稿です。
            </PlaceholderPanel>
          )}
        </div>
      </GuestbookShell>
    </AuthorNameProvider>
  );
}
