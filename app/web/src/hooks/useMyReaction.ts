"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMyReactions } from "@/components/guestbook/MyReactionsContext";

/**
 * 自分がこの投稿にいいねしているかを返す。
 *
 * ★エンドロールの「いいね順」の精度に直結する★
 *   初期状態が分からないまま白ハートを出すと、もう一度押したゲストのいいねが「取り消し」になってしまう。
 *
 * ★まず自分のいいねの一覧（MyReactionsContext。クエリ1回）を使う★（Issue #212）
 *   一覧で分からないとき（Provider の外・一覧が読めなかった・上限まで埋まった）だけ、
 *   fetchEach が true なら 1件を getDoc で読む。タイムラインは fetchEach を false にする
 *   （投稿の数だけ読みが走るため）。
 *
 * 戻り値:
 *   reacted … 赤いハートにするか
 *   loaded  … 押してよいか（false のあいだはハートを押せなくする）
 *   certain … reacted が確かか。false（分からないまま白）のときは、押しても likePost で付けるだけにして、取り消さない
 */
export function useMyReaction(postId: string, uid: string, fetchEach: boolean) {
  const list = useMyReactions();
  const fromList = list?.known(postId);
  const needFetch = fetchEach && fromList === undefined && (list === null || list.status === "partial");

  // 1件ずつ読んだ結果・押した結果は「どの投稿・誰の」ものかと一緒に持つ。投稿が変わったら描画時に未読込へ戻る
  const key = `${postId}/${uid}`;
  const [local, setLocal] = useState<{ key: string; reacted: boolean; certain: boolean } | null>(null);

  useEffect(() => {
    if (!needFetch) return;
    let alive = true;

    void getDoc(doc(db, "posts", postId, "reactions", uid))
      .then((snap) => {
        if (alive) setLocal({ key: `${postId}/${uid}`, reacted: snap.exists(), certain: true });
      })
      // 読めなくても押せるようにする（白ハートで始め、押したら付けるだけ）
      .catch(() => alive && setLocal({ key: `${postId}/${uid}`, reacted: false, certain: false }));

    return () => {
      alive = false;
    };
  }, [postId, uid, needFetch]);

  const setList = list?.set;
  const setReacted = useCallback(
    (reacted: boolean) => {
      setList?.(postId, reacted);
      setLocal({ key, reacted, certain: true });
    },
    [setList, postId, key],
  );

  const mine = local?.key === key ? local : null;
  if (fromList !== undefined) return { reacted: fromList, loaded: true, certain: true, setReacted };
  if (mine) return { reacted: mine.reacted, loaded: true, certain: mine.certain, setReacted };
  // 一覧の読み込み中、または1件を読んでいるあいだは押せない
  if (list?.status === "loading" || needFetch) return { reacted: false, loaded: false, certain: false, setReacted };
  // タイムラインで一覧から分からない投稿: 今までどおり白で始める
  return { reacted: false, loaded: true, certain: false, setReacted };
}
