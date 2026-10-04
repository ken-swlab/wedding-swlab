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
type Result = { postId: string; comments: Comment[]; error: FirestoreError | null };

export function useComments(postId: string, enabled: boolean, pageSize = 50) {
  // 結果は postId ごとに持ち、読み込み中かどうかは描画時に導く（effect 内で setState しない）
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const q = query(
      collection(db, "posts", postId, "comments"),
      orderBy("createdAt", "asc"),
      limit(pageSize), // Rules の request.query.limit <= 100 と整合させる
    );

    return onSnapshot(
      q,
      (snap) => setResult({ postId, comments: snap.docs.map(toComment), error: null }),
      (e) => setResult({ postId, comments: [], error: e }),
    );
  }, [postId, enabled, pageSize]);

  if (!enabled) return { comments: [] as Comment[], loading: false, error: null };
  if (result?.postId !== postId) return { comments: [] as Comment[], loading: true, error: null };
  return { comments: result.comments, loading: false, error: result.error };
}
