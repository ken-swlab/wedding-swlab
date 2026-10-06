"use client";

import { useEffect, useState } from "react";
import { collection, collectionGroup, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toPost } from "@/lib/posts";
import { toComment } from "@/lib/comments";
import type { Comment, Post } from "@/types";

/** 管理画面: 非表示の投稿（戻す操作のため）。orderBy を付けず（複合インデックスを増やさない）、画面で並べる */
const ADMIN_LIMIT = 100;
/** マイページ: 自分の非表示の投稿・コメント。Rules の上限（posts 50 / comments 100）より小さくする */
const MY_POST_LIMIT = 20;
const MY_COMMENT_LIMIT = 50;

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

/**
 * 本人: 非表示になった自分の投稿と、非表示の投稿に付けた自分のコメント（Issue #68）。
 * ★クエリに authorUid == 自分 を必ず付ける★ Rules はそれで「本人の分だけ」を許している
 *   （posts の canRead、comments の横断購読の authorUid == myUid()）。
 * コメントの横断クエリには複合インデックス（infra/terraform/moderation.tf）が要る。
 */
export function useMyHiddenItems(uid: string | null) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, "posts"), where("authorUid", "==", uid), where("status", "==", "hidden"), limit(MY_POST_LIMIT)),
      (snap) => setPosts(snap.docs.map(toPost).sort(byNewest)),
      (e) => console.error(e),
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collectionGroup(db, "comments"), where("authorUid", "==", uid), where("hidden", "==", true), limit(MY_COMMENT_LIMIT)),
      (snap) => setComments(snap.docs.map(toComment).sort(byNewest)),
      (e) => console.error(e),
    );
  }, [uid]);

  return { posts, comments };
}
