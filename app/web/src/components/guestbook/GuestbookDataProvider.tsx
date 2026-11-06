"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { usePosts } from "@/hooks/usePosts";
import { useUpload, type UploadApi } from "@/hooks/useUpload";
import { useGuestSessionContext } from "./GuestSessionContext";
import { MyReactionsProvider } from "./MyReactionsContext";
import { ComposerSheetProvider } from "./ComposerSheet";
import { PhotoIntroProvider } from "./PhotoIntroSheet";

type GuestbookData = ReturnType<typeof usePosts> & {
  /** ギャラリーの人物の絞り込み。詳細画面から戻っても残す */
  personUid: string;
  setPersonUid: (uid: string) => void;
};

const GuestbookDataContext = createContext<GuestbookData | null>(null);
// 送信の進捗は頻繁に変わるので、投稿一覧とは別の Context にして再描画を分ける
const GuestbookUploadContext = createContext<UploadApi | null>(null);

/**
 * /guestbook 以下の画面で共有する投稿一覧。guestbook/layout.tsx で1回だけ置く。
 *
 * ★posts の購読はここに1本だけ★
 *   ページで usePosts を呼ぶと、詳細画面との行き来のたびに購読を張り直し、
 *   「もっと見る」で読み込んだ分とスクロール位置が失われる。
 *   layout は画面を移ってもアンマウントされないので、ここに置く。
 *
 * ★高画質版の送信キュー（useUpload）もここに1つだけ★
 *   ページに置くと、送信中に詳細画面などへ移ったときに進捗の表示と
 *   離脱警告が消え、戻ったときに同じ原本を二重に送るおそれがある。
 *
 * ★自分のいいねの一覧（MyReactionsProvider）もここで1回だけ読む★（Issue #212）
 *   タイムライン・ギャラリー・詳細画面を行き来しても読み直さない。
 *
 * ★投稿画面（ComposerSheetProvider）もここに1つだけ★（Issue #224）どのページの「＋」からでも開き、
 *   高画質版は同じ送信キュー（useUpload）に入れる。
 */
export function GuestbookDataProvider({ children }: { children: ReactNode }) {
  const { user, tags, isAdmin } = useGuestSessionContext();
  const posts = usePosts(tags, isAdmin);
  const upload = useUpload(user?.uid);
  const [personUid, setPersonUid] = useState("");

  const { posts: list, loading, loadingMore, hasMore, loadMore, refresh: refreshPosts, syncPost, error } = posts;
  // ★引っ張って更新で、送信完了の知らせ（✓ N 枚の高画質版を送信しました）を閉じる★（Issue #128）
  //   送信キューは layout に1つなので、閉じた状態はタブを移っても残る（同じ完了を二度出さない）。
  //   未送信・失敗の表示は閉じない（消えるのは完了の知らせだけ）。
  const { dismissDone } = upload;
  const refresh = useCallback(() => {
    dismissDone();
    return refreshPosts();
  }, [dismissDone, refreshPosts]);
  const value = useMemo<GuestbookData>(
    () => ({ posts: list, loading, loadingMore, hasMore, loadMore, refresh, syncPost, error, personUid, setPersonUid }),
    [list, loading, loadingMore, hasMore, loadMore, refresh, syncPost, error, personUid],
  );

  return (
    <GuestbookDataContext.Provider value={value}>
      <GuestbookUploadContext.Provider value={upload}>
        <MyReactionsProvider uid={user?.uid}>
          {/* 「写真は2回に分けて届けます」の説明（Issue #272）。投稿の列（ComposerSheetProvider）と帯（UploadStatusBar）から出す */}
          <PhotoIntroProvider upload={upload}>
            <ComposerSheetProvider enqueue={upload.enqueue}>{children}</ComposerSheetProvider>
          </PhotoIntroProvider>
        </MyReactionsProvider>
      </GuestbookUploadContext.Provider>
    </GuestbookDataContext.Provider>
  );
}

export function useGuestbookUpload(): UploadApi {
  const v = useContext(GuestbookUploadContext);
  if (!v) throw new Error("GuestbookDataProvider の外で呼ばれました");
  return v;
}

export function useGuestbookData(): GuestbookData {
  const v = useContext(GuestbookDataContext);
  if (!v) throw new Error("GuestbookDataProvider の外で呼ばれました");
  return v;
}
