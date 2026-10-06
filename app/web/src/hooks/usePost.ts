"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, type QueryDocumentSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { toPost } from "@/lib/posts";
import { POST_ID_RE } from "@/config/guestbook";
import type { Post } from "@/types";

type State = { id: string; post: Post | null };

/**
 * 投稿1件の購読（詳細画面用）。
 *
 * ★見つからない・見えない・非表示はすべて post: null にまとめる★
 *   permission-denied を別扱いで表示すると、「その ID の投稿は存在するが
 *   あなたには見えない」ことが分かってしまう。
 *   hidden は Rules でも投稿者本人と管理者にしか返らないが、管理者にもここでは出さない（本人だけに出す）。
 *
 * enabled が false のあいだは購読しない（一覧にすでにある投稿を開いたとき）。
 */
export function usePost(id: string, enabled = true) {
  const valid = POST_ID_RE.test(id);
  // id ごとに結果を持ち、id が変わったら読み込み中に戻す（effect 内で setState しない）
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    if (!valid || !enabled) return;
    return onSnapshot(
      doc(db, "posts", id),
      (snap) => {
        const post = snap.exists() ? toPost(snap as QueryDocumentSnapshot) : null;
        // 非表示の投稿は、投稿者本人にだけ出す（「非表示になりました」を表示するため。Rules も本人には読ませる）
        const mine = post?.authorUid === auth.currentUser?.uid;
        setState({ id, post: post && (post.status === "visible" || mine) ? post : null });
      },
      (e) => {
        console.error(e);
        setState({ id, post: null });
      },
    );
  }, [id, valid, enabled]);

  if (!valid || !enabled) return { post: null, loading: false };
  if (state?.id !== id) return { post: null, loading: true };
  return { post: state.post, loading: false };
}
