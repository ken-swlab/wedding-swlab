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
  const [live, setLive] = useState<Post[]>([]);
  const [older, setOlder] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<FirestoreError | null>(null);
  const busy = useRef(false);

  // tags は毎レンダリング新しい配列になり得るので、内容で購読キーを作る
  const key = useMemo(() => [...tags].sort().join("|"), [tags]);
  const myTags = useMemo(
    () => (key ? key.split("|").slice(0, TAG_QUERY_LIMIT) : []),
    [key],
  );

  useEffect(() => {
    // タグが変わったら遡り分は破棄する（見える範囲が変わるため）
    setOlder([]);
    setExhausted(false);

    if (myTags.length === 0) {
      setLive([]);
      setLoading(false);
      return;
    }

    setLoading(true);
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
        setLive(snap.docs.map(toPost));
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e);
        setLoading(false);
      },
    );
  }, [myTags, pageSize]);

  const posts = useMemo(() => {
    const map = new Map<string, Post>();
    for (const p of live) map.set(p.id, p);
    for (const p of older) if (!map.has(p.id)) map.set(p.id, p);
    return [...map.values()].sort(byNewest);
  }, [live, older]);

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
      if (page.length < pageSize) setExhausted(true);
      if (page.length > 0) setOlder((o) => [...o, ...page]);
    } catch (e) {
      setError(e as FirestoreError);
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [exhausted, myTags, pageSize, posts]);

  return { posts, loading, loadingMore, hasMore: !exhausted, loadMore, error };
}
