"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, startAfter, where,
  type DocumentData, type FirestoreError, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toPost } from "@/lib/posts";
import { MY_POSTS_PAGE_SIZE } from "@/config/guestbook";
import type { Post } from "@/types";

/** createdAt が未確定（ローカル書き込み直後）のものは最新扱い */
function byNewest(a: Post, b: Post) {
  const am = a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
  const bm = b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
  return bm - am;
}

/**
 * マイページ: 自分の投稿を新しい順に並べる（Issue #87）。
 * 直近 pageSize 件はリアルタイム購読、それ以前は loadMore() で単発取得して継ぎ足す（usePosts と同じ構成）。
 *
 * ★authorUid == 自分 を必ず付け、visibleToTags の条件は付けない★
 *   Rules の canRead() は data.authorUid == myUid() で本人の投稿を許している。
 *   タグの条件を足すと、自分のタグが変わったあとの古い投稿が一覧から抜ける。
 *   authorUid の条件を外すと、他人の投稿が1件でも当たった時点でクエリ全体が permission-denied になる。
 * ★status では絞らない★ 新郎新婦が非表示にした投稿も、その位置に「非表示にしました。」を出すため。
 *   本人は非表示の自分の投稿も読める（Rules の canRead）。
 * ★limit は Rules の上限（posts 50）以下にする★
 * 複合インデックス posts(authorUid ASC, createdAt DESC) が要る（webhook の original-published と同じ形）。
 */
export function useMyPosts(uid: string | null, pageSize = MY_POSTS_PAGE_SIZE) {
  // 結果は uid と一緒に持ち、別の人に切り替わったら描画時に読み込み中へ戻す（usePosts の★参照）
  const [live, setLive] = useState<{ uid: string; posts: Post[] } | null>(null);
  const [older, setOlder] = useState<{ uid: string; posts: Post[]; exhausted: boolean } | null>(null);
  const [errorState, setErrorState] = useState<{ uid: string; error: FirestoreError | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "posts"),
      where("authorUid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(pageSize),
    );
    return onSnapshot(
      q,
      (snap) => {
        setLive({ uid, posts: snap.docs.map(toPost) });
        setErrorState({ uid, error: null });
      },
      (e) => {
        console.error(e);
        // 読めなくても読み込み中のままにしない
        setLive((l) => (l?.uid === uid ? l : { uid, posts: [] }));
        setErrorState({ uid, error: e });
      },
    );
  }, [uid, pageSize]);

  const livePosts = live && live.uid === uid ? live.posts : EMPTY;
  const olderPosts = older && older.uid === uid ? older.posts : EMPTY;
  const olderDone = !!older && older.uid === uid && older.exhausted;
  const loading = !!uid && live?.uid !== uid;
  const error = errorState && errorState.uid === uid ? errorState.error : null;
  // 最初の購読が pageSize 件に満たなければ、続きは無い
  const hasMore = !loading && !olderDone && (olderPosts.length > 0 || livePosts.length >= pageSize);

  const posts = useMemo(() => {
    const map = new Map<string, Post>();
    for (const p of livePosts) map.set(p.id, p);
    for (const p of olderPosts) if (!map.has(p.id)) map.set(p.id, p);
    return [...map.values()].sort(byNewest);
  }, [livePosts, olderPosts]);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore || !uid) return;

    const last = posts[posts.length - 1];
    if (!last?.createdAt) return;

    busy.current = true;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "posts"),
          where("authorUid", "==", uid),
          orderBy("createdAt", "desc"),
          startAfter(last.createdAt),
          limit(pageSize),
        ),
      );
      const page = snap.docs.map(toPost);
      setOlder((o) => ({
        uid,
        posts: [...(o?.uid === uid ? o.posts : []), ...page],
        exhausted: page.length < pageSize,
      }));
    } catch (e) {
      console.error(e);
      setErrorState({ uid, error: e as FirestoreError });
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, pageSize, posts, uid]);

  /**
   * 編集・削除した投稿を、遡って読み込んだ分（older）にも反映する（Issue #94）。
   * 直近の分は購読しているので自動で変わるが、loadMore() で読んだ分は読んだ時点のまま残る。
   * 1件を読み直し、無ければ（削除された・読めなくなった）一覧から外す。
   */
  const syncPost = useCallback(async (id: string) => {
    let fresh: Post | null = null;
    try {
      const snap = await getDoc(doc(db, "posts", id));
      fresh = snap.exists() ? toPost(snap as QueryDocumentSnapshot<DocumentData>) : null;
    } catch {
      // 存在しない投稿の get は Rules が拒否する。消えたものとして扱う
      fresh = null;
    }
    setOlder((o) =>
      o && o.posts.some((p) => p.id === id)
        ? { ...o, posts: o.posts.flatMap((p) => (p.id !== id ? [p] : fresh ? [fresh] : [])) }
        : o,
    );
  }, []);

  return { posts, loading, loadingMore, hasMore, loadMore, syncPost, error };
}

const EMPTY: Post[] = [];
