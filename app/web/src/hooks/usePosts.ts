"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection, limit, onSnapshot, orderBy, query, where,
  type FirestoreError,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toPost } from "@/lib/posts";
import { TAG_QUERY_LIMIT } from "@/config/tags";
import type { Post } from "@/types";

/**
 * タグで絞り込んだリアルタイムタイムライン。
 *
 * ★ Security Rules はフィルタではない ★
 * where('visibleToTags','array-contains-any', myTags) を外すと、
 * 自分に見えない投稿が1件でもヒットした時点でクエリ全体が
 * permission-denied になる。この where 句は「性能」ではなく「成立条件」。
 */
export function usePosts(tags: string[], pageSize = 30) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  // tags は毎レンダリング新しい配列になり得るので、内容で購読キーを作る
  const key = useMemo(() => [...tags].sort().join("|"), [tags]);

  useEffect(() => {
    const myTags = key ? key.split("|").slice(0, TAG_QUERY_LIMIT) : [];

    if (myTags.length === 0) {
      setPosts([]);
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
        setPosts(snap.docs.map(toPost));
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e);
        setLoading(false);
      },
    );
  }, [key, pageSize]);

  return { posts, loading, error };
}
