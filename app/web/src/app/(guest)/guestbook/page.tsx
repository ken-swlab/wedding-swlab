"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { useGuestbookData, useGuestbookUpload } from "@/components/guestbook/GuestbookDataProvider";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { usePathname, useRouter } from "next/navigation";
import { useBackdropLocation } from "@/hooks/useBackdropLocation";
import { filterPosts, parseQuery } from "@/lib/search";
import { Composer } from "@/components/guestbook/Composer";
import { Timeline } from "@/components/guestbook/Timeline";
import { GalleryGrid } from "@/components/guestbook/GalleryGrid";
import { PersonFilter } from "@/components/guestbook/PersonFilter";
import { useGuestDirectory } from "@/hooks/useGuestDirectory";
import type { Person } from "@/lib/visibility";
import { PostLightbox } from "@/components/guestbook/PostLightbox";
import { PostDetailSheet } from "@/components/guestbook/PostDetailSheet";
import { PhotoPicker } from "@/components/guestbook/PhotoPicker";
import {
  UploadStatusBar,
  type PendingOriginal,
} from "@/components/guestbook/UploadStatusBar";
import { AuthorNameProvider } from "@/components/guestbook/AuthorNameProvider";
import { GuestbookShell, selectModeHref, useGuestbookView } from "@/components/guestbook/GuestbookShell";
import {
  COMPOSER_ANCHOR_ID,
  GUESTBOOK_QUERY_PARAM,
  GUESTBOOK_SELECT_PARAM,
  postIdFromPath,
} from "@/config/guestbook";
import { publicName } from "@/lib/names";
import { SplashScreen } from "@/components/SplashScreen";
import { ScreenFade, useDarkEntry } from "@/components/ScreenFade";
import { OPENING_TIMING } from "@/config/opening";
import { WelcomeMoment } from "@/components/guestbook/WelcomeMoment";
import { WelcomePinned } from "@/components/guestbook/WelcomeCard";
import { getJson, postJson } from "@/lib/api-client";
import { likePost } from "@/lib/posts";
import type { WelcomeContent, WelcomeStatus } from "@/types/welcome";

export default function GuestbookPage() {
  const { user, tags, loading: authLoading, profile, profileLoading } = useGuestSessionContext();
  // 承認待ち（黒）から来たら、光が広がってタイムラインが現れる（Issue #157 B-5）
  const darkEntry = useDarkEntry();

  // ★posts は1本しか購読しない★
  //   購読は guestbook/layout.tsx（GuestbookDataProvider）が持つ。
  //   タイムラインとギャラリー、詳細画面は同じ配列を見るので、
  //   タブの切り替えや詳細画面との行き来で Firestore への再取得は発生しない。
  const { posts: allPosts, loading, loadingMore, hasMore, loadMore, error, personUid, setPersonUid } =
    useGuestbookData();

  // 検索語はヘッダーの検索欄が ?q= に書く。読み込み済みの投稿だけを端末で絞り込む（lib/search.ts）
  // 詳細シートの表示中は URL が変わるので、開く前の値を読む（useBackdropLocation の★参照）
  const { params } = useBackdropLocation();
  const query = params.get(GUESTBOOK_QUERY_PARAM) ?? "";
  // ギャラリーで保存する写真を選ぶモード。ヘッダーのダウンロードボタンが ?select=1 を付ける
  const router = useRouter();
  // タイムラインのカードから開いた詳細シート（PostDetailSheet の★参照）。
  // URL が /guestbook/posts/{id} の間だけ出し、戻る操作で URL が戻ったら外す
  const sheetId = postIdFromPath(usePathname());
  const terms = useMemo(() => parseQuery(query), [query]);
  const searching = terms.length > 0;
  const posts = useMemo(() => filterPosts(allPosts, terms), [allPosts, terms]);
  // 送信キューも layout 側に1つだけ（GuestbookDataProvider の★参照）
  const upload = useGuestbookUpload();

  // タイムライン / ギャラリーはボトムナビが ?view= で切り替える
  const view = useGuestbookView();
  const selecting = view === "gallery" && params.get(GUESTBOOK_SELECT_PARAM) === "1";
  // 選択モードの自動読み込みに渡す。毎回作り直すと読み込みの見張りが張り直しになる
  const loadMoreGallery = useCallback(() => void loadMore(), [loadMore]);
  // 詳細画面などから戻ったら、そのビューで見ていた位置に戻す
  useScrollRestore(view);
  const directory = useGuestDirectory(view === "gallery" && tags.length > 0);
  const [openId, setOpenId] = useState<string | null>(null);

  /**
   * 承認後の初回の演出（Issue #150）。出すかはサーバーが決める（GET /api/guest/welcome）。
   * ★出し始めたらすぐ welcomeSeenAt を記録する★ 途中で閉じても、端末を変えても二度出さない。
   * ★演出の直後だけ、その投稿をタイムラインの一番上に固定する★ この state だけで持つので、
   *   再読み込みすると通常の並び（投稿日時の順）に戻る。
   */
  const [welcome, setWelcome] = useState<WelcomeContent | null>(null);
  const [welcomeRunning, setWelcomeRunning] = useState(false);
  // 幕（ScreenFade の approved）が開ききる時刻。承認待ちから来たときだけ
  const [curtainUntil] = useState(() => (darkEntry === "approved" ? Date.now() + OPENING_TIMING.curtainOpen : 0));
  const [pin, setPin] = useState<{ content: WelcomeContent; hidden: boolean } | null>(null);
  const uid = user?.uid;
  useEffect(() => {
    if (!uid || tags.length === 0) return;
    let cancelled = false;
    getJson<WelcomeStatus>("/api/guest/welcome")
      .then((r) => {
        if (cancelled || !r.show || !r.content) return;
        setWelcome(r.content);
        // ★承認待ちから来たときは、幕が開ききってから始める★（Issue #165。幕 → タイムライン → 思い出の写真）
        const wait = Math.max(0, curtainUntil - Date.now());
        if (wait > 0) setTimeout(() => !cancelled && setWelcomeRunning(true), wait);
        else setWelcomeRunning(true);
        postJson("/api/guest/welcome", {}).catch((e: unknown) => console.error("[guestbook] 演出の記録に失敗しました", e));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid, tags.length, curtainUntil]);

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
  // ★検索の絞り込み前の一覧で数える★ 絞り込んだ結果で数えると取り残しを見落とす
  const serverPending = useMemo<PendingOriginal[]>(
    () =>
      allPosts
        .filter((p) => p.authorUid === user?.uid)
        .flatMap((p) =>
          p.media
            .filter((m) => m.type === "image" && m.originalStatus === "pending")
            .map((m) => ({ postId: p.id, thumbPath: m.storagePath })),
        ),
    [allPosts, user?.uid],
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
      <ScreenFade from={darkEntry} />
      {welcome && welcomeRunning && view === "timeline" && (
        <WelcomeMoment
          content={welcome}
          onLike={welcome.postId ? () => likePost(welcome.postId!, user.uid).then(() => true, (e: unknown) => { console.error(e); return false; }) : undefined}
          onPin={() => setPin({ content: welcome, hidden: true })}
          onReveal={() => setPin((p) => (p ? { ...p, hidden: false } : p))}
          onDone={({ liked }) => {
            setWelcomeRunning(false);
            // スキップ（いいねしていない）なら固定しない
            if (!liked) setPin(null);
          }}
        />
      )}
      <GuestbookShell>
          <div className="space-y-4">
            <UploadStatusBar upload={upload} serverPending={serverPending} />

            {searching && (
              <SearchSummary
                query={query}
                count={view === "timeline" ? posts.length : gallery.length}
                unit={view === "timeline" ? "件" : "枚の写真"}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={() => void loadMore()}
              />
            )}

            {view === "timeline" ? (
              <>
                {/* ヘッダーの「＋」はここへ飛ぶ。scroll-mt はヘッダーに隠れない分 */}
                {!searching && (
                  <div id={COMPOSER_ANCHOR_ID} className="scroll-mt-[calc(4.5rem+env(safe-area-inset-top))]">
                    <Composer user={user} tags={tags} onUploadOriginals={upload.enqueue} />
                  </div>
                )}
                {pin && !searching && <WelcomePinned content={pin.content} hidden={pin.hidden} />}
                {searching && !loading && !error && posts.length === 0 ? null : (
                  <Timeline
                    // 固定して出している投稿は、二重に並べない
                    posts={pin?.content.postId ? posts.filter((p) => p.id !== pin.content.postId) : posts}
                    loading={loading}
                    error={error}
                    user={user}
                  />
                )}
                {!searching && hasMore && posts.length > 0 && (
                  <LoadMore loading={loadingMore} onClick={() => void loadMore()} />
                )}
              </>
            ) : (
              <>
                <PersonFilter viewer={viewer} people={directory.people} value={personUid} onChange={setPersonUid} />
                {selecting ? (
                  // 顔・文字の絞り込みはそのまま。絞り込んだ一覧（gallery）から写真を選ぶ
                  <PhotoPicker
                    posts={gallery}
                    hasMore={hasMore}
                    loadingMore={loadingMore}
                    loadMore={loadMoreGallery}
                    onExit={() => router.replace(selectModeHref(params, false), { scroll: false })}
                  />
                ) : personUid && gallery.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-400">その方が写っている写真はまだありません。</p>
                ) : (
              <GalleryGrid posts={gallery} onOpen={setOpenId}
                footer={
                  hasMore && !personUid && !searching && gallery.length > 0 ? (
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
      {sheetId && <PostDetailSheet key={sheetId} id={sheetId} user={user} />}
      </GuestbookShell>
    </AuthorNameProvider>
  );
}

/** 検索結果の件数と、さらに過去の投稿を読み込んで探すボタン */
function SearchSummary({
  query, count, unit, hasMore, loadingMore, onLoadMore,
}: {
  query: string;
  count: number;
  unit: string;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-4 text-sm shadow-sm">
      <p className="text-stone-800">
        「<span className="font-medium">{query}</span>」の検索結果：
        <span className="tabular-nums">{count}</span>
        {unit}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">
        {hasMore
          ? "読み込み済みの投稿から探しています。見つからないときは、さらに過去の投稿を読み込んで探せます。"
          : "すべての投稿から探しました。"}
      </p>
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mt-3 w-full touch-manipulation rounded-full border border-stone-200 py-2.5 text-sm text-stone-600 transition hover:bg-stone-100 disabled:opacity-50"
        >
          {loadingMore ? "読み込み中…" : "さらに過去の投稿から探す"}
        </button>
      )}
    </div>
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
