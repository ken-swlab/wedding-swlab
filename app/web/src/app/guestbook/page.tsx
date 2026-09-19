"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuestSession } from "@/hooks/useGuestSession";
import { usePosts } from "@/hooks/usePosts";
import { useUpload } from "@/hooks/useUpload";
import { Composer } from "@/components/guestbook/Composer";
import { Timeline } from "@/components/guestbook/Timeline";
import { GalleryGrid } from "@/components/guestbook/GalleryGrid";
import { PersonFilter } from "@/components/guestbook/PersonFilter";
import { useGuestDirectory } from "@/hooks/useGuestDirectory";
import type { Person } from "@/lib/visibility";
import { PostLightbox } from "@/components/guestbook/PostLightbox";
import { ViewTabs, type GuestbookView } from "@/components/guestbook/ViewTabs";
import { UploadStatusBar } from "@/components/guestbook/UploadStatusBar";
import { OnboardingForm } from "@/components/guestbook/OnboardingForm";
import { PendingApproval } from "@/components/guestbook/PendingApproval";
import { AuthorNameProvider } from "@/components/guestbook/AuthorNameProvider";
import { publicName } from "@/lib/names";
import { SplashScreen } from "@/components/SplashScreen";

export default function GuestbookPage() {
  const router = useRouter();
  const { user, tags, loading: authLoading, profile, profileLoading, refreshTags } =
    useGuestSession();

  // ★posts は1本しか購読しない★
  //   タイムラインとギャラリーは同じ配列を見るので、
  //   タブを切り替えても Firestore への再取得は発生しない。
  const { posts, loading, loadingMore, hasMore, loadMore, error } = usePosts(tags);
  const upload = useUpload();

  const [view, setView] = useState<GuestbookView>("timeline");
  const [personUid, setPersonUid] = useState("");
  const directory = useGuestDirectory(view === "gallery" && tags.length > 0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/");
  }, [authLoading, user, router]);

  // ライトボックスの前後移動は「写真を持つ投稿」の並びを辿る
  const viewer = useMemo<Person | null>(() => user && profile ? { uid: user.uid, name: profile.nickname || profile.displayName, kana: "", tags } : null, [user, profile, tags]);
  const gallery = useMemo(() => {
    const withMedia = posts.filter((p) => p.media.length > 0);
    if (!personUid) return withMedia;
    return withMedia.filter((p) => p.detectedUserIds?.includes(personUid));
  }, [posts, personUid]);
  const index = openId ? gallery.findIndex((p) => p.id === openId) : -1;
  const current = index >= 0 ? gallery[index] : null;

  const move = useCallback(
    (delta: number) => {
      const next = gallery[index + delta];
      if (next) setOpenId(next.id);
    },
    [gallery, index],
  );

  if (authLoading || !user) {
    return <SplashScreen phase={authLoading ? "booting" : "line-login"} />;
  }
  if (profileLoading || !profile) {
    return <SplashScreen phase="booting" />;
  }

  const needsOnboarding = editing || !profile.isRegistered;
  const unlocked = profile.isApproved && tags.length > 0;

  const authorName = publicName(profile);

  return (
    <AuthorNameProvider value={authorName}>
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-xl px-4 py-8">
        <header className="mb-6 text-center">
          <h1 className="font-serif text-2xl tracking-wide text-stone-900">Guest Book</h1>
          <p className="mt-1 text-sm text-stone-500">おふたりへのメッセージを残してください</p>
        </header>

        {needsOnboarding ? (
          <OnboardingForm
            user={user}
            initialNickname={profile.nickname}
            onDone={() => setEditing(false)}
          />
        ) : !unlocked ? (
          <PendingApproval
            nickname={profile.nickname}
            approvedButStale={profile.isApproved}
            onEdit={() => setEditing(true)}
            onRefresh={() => void refreshTags()}
          />
        ) : (
          <div className="space-y-4">
            <UploadStatusBar
              jobs={upload.jobs}
              onRetry={upload.retryFailed}
              onDismiss={upload.clearDone}
            />

            <ViewTabs value={view} onChange={setView} />

            {view === "timeline" ? (
              <>
                <Composer user={user} tags={tags} onUploadOriginals={upload.enqueue} />
                <Timeline posts={posts} loading={loading} error={error} user={user} />
                {hasMore && posts.length > 0 && (
                  <LoadMore loading={loadingMore} onClick={() => void loadMore()} />
                )}
              </>
            ) : (
              <>
                <PersonFilter viewer={viewer} people={directory.people} value={personUid} onChange={setPersonUid} />
                {personUid && gallery.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-400">その方が写っている写真はまだありません。</p>
                ) : (
              <GalleryGrid posts={gallery} onOpen={setOpenId}
                footer={
                  hasMore && !personUid && gallery.length > 0 ? (
                    <div className="pt-4">
                      <LoadMore loading={loadingMore} onClick={() => void loadMore()} />
                    </div>
                  ) : null
                }
              />
              )}
              </>
            )}
          </div>
        )}
      </div>

      {current && (
        <PostLightbox
          post={current}
          user={user}
          hasPrev={index > 0}
          hasNext={index < gallery.length - 1}
          onPrev={() => move(-1)}
          onNext={() => move(1)}
          onClose={() => setOpenId(null)}
        />
      )}
    </main>
    </AuthorNameProvider>
  );
}

function LoadMore({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full rounded-full border border-stone-200 bg-white py-2.5 text-sm text-stone-500 transition hover:bg-stone-100 disabled:opacity-50"
    >
      {loading ? "読み込み中…" : "もっと見る"}
    </button>
  );
}
