"use client";

import { useCallback, useMemo, useState } from "react";
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
import {
  UploadStatusBar,
  type PendingOriginal,
} from "@/components/guestbook/UploadStatusBar";
import { AuthorNameProvider } from "@/components/guestbook/AuthorNameProvider";
import { GuestShell } from "@/components/guestbook/GuestShell";
import { publicName } from "@/lib/names";
import { SplashScreen } from "@/components/SplashScreen";

export default function GuestbookPage() {
  const { user, tags, loading: authLoading, profile, profileLoading } = useGuestSession();

  // ★posts は1本しか購読しない★
  //   タイムラインとギャラリーは同じ配列を見るので、
  //   タブを切り替えても Firestore への再取得は発生しない。
  const { posts, loading, loadingMore, hasMore, loadMore, error } = usePosts(tags);
  const upload = useUpload(user?.uid);

  const [view, setView] = useState<GuestbookView>("timeline");
  const [personUid, setPersonUid] = useState("");
  const directory = useGuestDirectory(view === "gallery" && tags.length > 0);
  const [openId, setOpenId] = useState<string | null>(null);

  // ★振り分けは (guest)/layout.tsx が行う★
  //   未登録・未承認・停止の判定はすべて layout 側に集約したので、
  //   このページは「承認済みで開ける状態」だけを描く。

  // ライトボックスの前後移動は「写真を持つ投稿」の並びを辿る
  const viewer = useMemo<Person | null>(() => user && profile ? { uid: user.uid, name: profile.nickname || profile.displayName, kana: "", tags } : null, [user, profile, tags]);
  const gallery = useMemo(() => {
    const withMedia = posts.filter((p) => p.media.length > 0);
    if (!personUid) return withMedia;
    return withMedia.filter((p) => p.detectedUserIds?.includes(personUid));
  }, [posts, personUid]);
  // ★取り残し検出用★
  //   自分の投稿で原本が pending のメディアを「どれか」まで特定して渡す。
  //   件数の引き算だと誤検知するので、thumbPath で突き合わせる。
  const serverPending = useMemo<PendingOriginal[]>(
    () =>
      posts
        .filter((p) => p.authorUid === user?.uid)
        .flatMap((p) =>
          p.media
            .filter((m) => m.type === "image" && m.originalStatus === "pending")
            .map((m) => ({ postId: p.id, thumbPath: m.storagePath })),
        ),
    [posts, user?.uid],
  );

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

  const authorName = publicName(profile);

  return (
    <AuthorNameProvider value={authorName}>
      <GuestShell>
          <div className="space-y-4">
            <UploadStatusBar upload={upload} serverPending={serverPending} />

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
      </GuestShell>
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
