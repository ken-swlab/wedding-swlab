"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection, getDocs, limit, onSnapshot, orderBy, query, startAfter, where,
  type FirestoreError,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toPost } from "@/lib/posts";
import { TAG_QUERY_LIMIT } from "@/config/tags";
import type { Post } from "@/types";

/** createdAt が未確定（ローカル書き込み直後）のものは最新扱い */
function byNewest(a: Post, b: Post) {
  const am = a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
  const bm = b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
  return bm - am;
}

/**
 * タグで絞り込んだ投稿一覧。
 *
 * ★Security Rules はフィルタではない★
 *   where('visibleToTags','array-contains-any', myTags) を外すと、
 *   自分に見えない投稿が1件でもヒットした時点でクエリ全体が
 *   permission-denied になる。この where 句は「性能」ではなく「成立条件」。
 *
 * 直近 pageSize 件はリアルタイム購読、それ以前は loadMore() で
 * 単発取得して継ぎ足す。ギャラリーで過去を遡るための構成で、
 * タイムラインとギャラリーは同じ配列を共有する（タブ切替で再取得しない）。
 */
export function usePosts(tags: string[], pageSize = 50) {
  // tags は毎レンダリング新しい配列になり得るので、内容で購読キーを作る
  const key = useMemo(() => [...tags].sort().join("|"), [tags]);
  const myTags = useMemo(
    () => (key ? key.split("|").slice(0, TAG_QUERY_LIMIT) : []),
    [key],
  );

  /**
   * ★結果はすべて購読キー（タグの組）と一緒に持つ★
   *   タグが変わったら、描画時に「読み込み中・遡り分なし」へ戻る。
   *   見える範囲が変わったのに前のタグの投稿を出し続けないため。
   *   effect の中で setState してリセットすると描画が二重に走る。
   */
  const [live, setLive] = useState<{ key: string; posts: Post[] } | null>(null);
  const [older, setOlder] = useState<{ key: string; posts: Post[]; exhausted: boolean } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; error: FirestoreError | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (myTags.length === 0) return;

    const q = query(
      collection(db, "posts"),
      where("status", "==", "visible"),
      where("visibleToTags", "array-contains-any", myTags),
      orderBy("createdAt", "desc"),
      limit(pageSize), // Rules の request.query.limit <= 50 と整合させること
    );

    return onSnapshot(
      q,
      (snap) => {
        setLive({ key, posts: snap.docs.map(toPost) });
        setErrorState({ key, error: null });
      },
      (e) => {
        // 読めなくても読み込み中のままにしない
        setLive((l) => (l?.key === key ? l : { key, posts: [] }));
        setErrorState({ key, error: e });
      },
    );
  }, [key, myTags, pageSize]);

  const livePosts = live?.key === key ? live.posts : EMPTY;
  const olderPosts = older?.key === key ? older.posts : EMPTY;
  const exhausted = older?.key === key && older.exhausted;
  const loading = myTags.length > 0 && live?.key !== key;
  const error = errorState?.key === key ? errorState.error : null;

  const posts = useMemo(() => {
    const map = new Map<string, Post>();
    for (const p of livePosts) map.set(p.id, p);
    for (const p of olderPosts) if (!map.has(p.id)) map.set(p.id, p);
    return [...map.values()].sort(byNewest);
  }, [livePosts, olderPosts]);

  const loadMore = useCallback(async () => {
    if (busy.current || exhausted || myTags.length === 0) return;

    const last = posts[posts.length - 1];
    if (!last?.createdAt) return;

    busy.current = true;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "posts"),
          where("status", "==", "visible"),
          where("visibleToTags", "array-contains-any", myTags),
          orderBy("createdAt", "desc"),
          startAfter(last.createdAt),
          limit(pageSize),
        ),
      );
      const page = snap.docs.map(toPost);
      // 取得中にタグが変わっていたら、古いキーの分として捨てられる（表示には出ない）
      setOlder((o) => ({
        key,
        posts: [...(o?.key === key ? o.posts : []), ...page],
        exhausted: page.length < pageSize,
      }));
    } catch (e) {
      setErrorState({ key, error: e as FirestoreError });
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [exhausted, key, myTags, pageSize, posts]);

  return { posts, loading, loadingMore, hasMore: !exhausted, loadMore, error };
}

const EMPTY: Post[] = [];
