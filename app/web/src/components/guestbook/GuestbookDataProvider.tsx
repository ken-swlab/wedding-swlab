"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { usePosts } from "@/hooks/usePosts";
import { useUpload, type UploadApi } from "@/hooks/useUpload";
import { useGuestSessionContext } from "./GuestSessionContext";

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
 */
export function GuestbookDataProvider({ children }: { children: ReactNode }) {
  const { user, tags, isAdmin } = useGuestSessionContext();
  const posts = usePosts(tags, isAdmin);
  const upload = useUpload(user?.uid);
  const [personUid, setPersonUid] = useState("");

  const { posts: list, loading, loadingMore, hasMore, loadMore, refresh, error } = posts;
  const value = useMemo<GuestbookData>(
    () => ({ posts: list, loading, loadingMore, hasMore, loadMore, refresh, error, personUid, setPersonUid }),
    [list, loading, loadingMore, hasMore, loadMore, refresh, error, personUid],
  );

  return (
    <GuestbookDataContext.Provider value={value}>
      <GuestbookUploadContext.Provider value={upload}>{children}</GuestbookUploadContext.Provider>
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
