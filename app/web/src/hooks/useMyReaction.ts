"use client";

import { useCallback, useEffect, useState } from "react";
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
  // 結果は「どの投稿・誰の」ものかと一緒に持つ。投稿が変わったら描画時に未読込へ戻る
  const key = `${postId}/${uid}`;
  const [state, setState] = useState<{ key: string; reacted: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    void getDoc(doc(db, "posts", postId, "reactions", uid))
      .then((snap) => {
        if (alive) setState({ key: `${postId}/${uid}`, reacted: snap.exists() });
      })
      // 読めなくても押せるようにする（以前と同じく白ハート扱い）
      .catch(() => alive && setState({ key: `${postId}/${uid}`, reacted: false }));

    return () => {
      alive = false;
    };
  }, [postId, uid, enabled]);

  const setReacted = useCallback((reacted: boolean) => setState({ key, reacted }), [key]);
  const loaded = state?.key === key;

  return { reacted: loaded && state.reacted, setReacted, loaded };
}
