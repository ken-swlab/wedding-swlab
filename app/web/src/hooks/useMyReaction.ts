"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * 自分がこの投稿にいいねしているかを読む。
 *
 * ★エンドロールの「いいね順」の精度に直結する★
 *   初期状態を読まないと、リロード後に白ハートが表示され、
 *   もう一度押したゲストのいいねが「取り消し」になってしまう。
 *
 * ライトボックス（1件詳細）でだけ使うこと。
 * タイムライン全件で呼ぶと投稿数ぶんの読み取りが走る。
 */
export function useMyReaction(postId: string, uid: string, enabled: boolean) {
  const [reacted, setReacted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoaded(false);

    void getDoc(doc(db, "posts", postId, "reactions", uid))
      .then((snap) => {
        if (!alive) return;
        setReacted(snap.exists());
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));

    return () => {
      alive = false;
    };
  }, [postId, uid, enabled]);

  return { reacted, setReacted, loaded };
}
