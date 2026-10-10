"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toPost } from "@/lib/posts";
import type { Post } from "@/types";

/** 管理画面: 非表示の投稿（戻す操作のため）。orderBy を付けず（複合インデックスを増やさない）、画面で並べる */
const ADMIN_LIMIT = 100;

function byNewest<T extends { createdAt: { toMillis(): number } | null }>(a: T, b: T) {
  return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
}

/** 管理者: status == "hidden" の投稿。Rules は管理者なら status を問わず読める */
export function useAdminHiddenPosts(enabled: boolean) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      query(collection(db, "posts"), where("status", "==", "hidden"), limit(ADMIN_LIMIT)),
      (snap) => setPosts(snap.docs.map(toPost).sort(byNewest)),
      (e) => {
        console.error(e);
        setPosts([]);
      },
    );
  }, [enabled]);
  return { posts: posts ?? [], loading: enabled && posts === null };
}
