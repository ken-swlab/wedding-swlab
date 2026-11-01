"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { collectionGroup, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MY_REACTIONS_LIMIT } from "@/config/guestbook";

/**
 * 自分がいいねした投稿 ID の一覧（Issue #212）。
 *   loading … 読み込み中（ハートは押せない。白いまま押して取り消しになるのを防ぐ）
 *   ready   … 全部読めた。一覧に無い投稿は「いいねしていない」と分かっている
 *   partial … 一覧が読めなかった（Rules・インデックスの反映前など）か、上限（MY_REACTIONS_LIMIT）まで埋まった。
 *             一覧にある投稿は赤、無い投稿は「分からない」（白で始め、押すと付けるだけ。取り消さない）
 */
export type MyReactionsStatus = "loading" | "ready" | "partial";

type MyReactions = {
  status: MyReactionsStatus;
  /** true: いいね済み / false: いいねしていない / undefined: まだ分からない */
  known: (postId: string) => boolean | undefined;
  /** いいねした・取り消したときに、画面の中の一覧も直す（読み直さない） */
  set: (postId: string, reacted: boolean) => void;
};

const MyReactionsContext = createContext<MyReactions | null>(null);

/**
 * 自分のいいねの一覧を、/guestbook 以下で1回だけ読んで配る（GuestbookDataProvider の中に置く）。
 *
 * ★読み取りはクエリ1回★ collectionGroup("reactions") を自分の uid で絞る。
 *   以前はタイムラインで読まずに白いハートから始めていたため、ログインし直すといいね済みの投稿が白く見え、
 *   押すと取り消しになっていた（useMyReaction の★参照）。投稿ごとに getDoc すると投稿の数だけ読みが走る。
 * ★Rules（match /{path=**}/reactions）とインデックス（Terraform の reactions_uid）がそろって初めて読める★
 *   読めないときは partial にして、今までの動き（白で始める）に戻す。
 * ★uid が変わったら読み直す★ 結果は uid と一緒に持ち、別の人の一覧を一瞬でも使わない。
 */
export function MyReactionsProvider({ uid, children }: { uid: string | undefined; children: ReactNode }) {
  const [state, setState] = useState<{ uid: string; status: Exclude<MyReactionsStatus, "loading">; ids: Set<string> } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    getDocs(query(collectionGroup(db, "reactions"), where("uid", "==", uid), limit(MY_REACTIONS_LIMIT)))
      .then((snap) => {
        if (!alive) return;
        // posts/{postId}/reactions/{uid} の postId
        const ids = new Set(snap.docs.map((d) => d.ref.parent.parent?.id).filter((id): id is string => !!id));
        setState({ uid, status: snap.size >= MY_REACTIONS_LIMIT ? "partial" : "ready", ids });
      })
      .catch((e) => {
        console.error(e);
        if (alive) setState({ uid, status: "partial", ids: new Set() });
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  const current = uid && state?.uid === uid ? state : null;

  const set = useCallback(
    (postId: string, reacted: boolean) => {
      if (!uid) return;
      setState((prev) => {
        if (!prev || prev.uid !== uid) return prev;
        if (prev.ids.has(postId) === reacted) return prev;
        const ids = new Set(prev.ids);
        if (reacted) ids.add(postId);
        else ids.delete(postId);
        return { ...prev, ids };
      });
    },
    [uid],
  );

  const value = useMemo<MyReactions>(() => {
    const status: MyReactionsStatus = current ? current.status : "loading";
    return {
      status,
      known: (postId) => {
        if (!current) return undefined;
        if (current.ids.has(postId)) return true;
        return current.status === "ready" ? false : undefined;
      },
      set,
    };
  }, [current, set]);

  return <MyReactionsContext.Provider value={value}>{children}</MyReactionsContext.Provider>;
}

/** Provider の外（管理画面のデザイン見本など）では null。呼ぶ側は1件ずつの読み取りに戻る */
export function useMyReactions(): MyReactions | null {
  return useContext(MyReactionsContext);
}
