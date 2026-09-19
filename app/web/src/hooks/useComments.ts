"use client";

import { useEffect, useState } from "react";
import {
  collection, limit, onSnapshot, orderBy, query,
  type FirestoreError,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toComment } from "@/lib/comments";
import type { Comment } from "@/types";

/**
 * 投稿1件分のコメントをリアルタイム購読する。
 *
 * enabled を必ず渡すこと。タイムライン上の全投稿に常時リスナーを張ると
 * 30投稿 = 30本の接続になるため、開いたカードだけ購読する設計にしている。
 */
export function useComments(postId: string, enabled: boolean, pageSize = 50) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!enabled) {
      setComments([]);
      setError(null);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "posts", postId, "comments"),
      orderBy("createdAt", "asc"),
      limit(pageSize), // Rules の request.query.limit <= 100 と整合させる
    );

    return onSnapshot(
      q,
      (snap) => {
        setComments(snap.docs.map(toComment));
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e);
        setLoading(false);
      },
    );
  }, [postId, enabled, pageSize]);

  return { comments, loading, error };
}
