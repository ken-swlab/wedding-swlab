"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, startAfter, where,
  type DocumentData, type FirestoreError, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toPost } from "@/lib/posts";
import { TAG_QUERY_LIMIT } from "@/config/tags";
import { PULL_REFRESH_COOLDOWN_MS, PULL_REFRESH_TIMEOUT_MS } from "@/config/guestbook";
import type { Post } from "@/types";

/** createdAt が未確定（ローカル書き込み直後）のものは最新扱い */
function byNewest(a: Post, b: Post) {
  const am = a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
  const bm = b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
  return bm - am;
}

/**
 * タグで絞り込んだ投稿一覧。
 *
 * ★Security Rules はフィルタではない★
 *   where('visibleToTags','array-contains-any', myTags) を外すと、
 *   自分に見えない投稿が1件でもヒットした時点でクエリ全体が
 *   permission-denied になる。この where 句は「性能」ではなく「成立条件」。
 *
 * ★管理者（新郎新婦）にはタグの条件を付けず、表示中の全投稿を出す★（Issue #97）
 *   Rules は管理者に全投稿を読ませている（canRead の isAdmin）。タグで絞ると、新郎新婦が持っていない
 *   タグだけの投稿が一覧から抜ける。このクエリには複合インデックス posts(status, createdAt) が要る
 *   （infra/terraform/firestore_rules.tf の posts_timeline_admin）。
 *   管理者でない人がこの形で問い合わせると、Rules が全体を拒否する。
 *
 * 直近 pageSize 件はリアルタイム購読、それ以前は loadMore() で
 * 単発取得して継ぎ足す。ギャラリーで過去を遡るための構成で、
 * タイムラインとギャラリーは同じ配列を共有する（タブ切替で再取得しない）。
 */
export function usePosts(tags: string[], isAdmin = false, pageSize = 50) {
  // tags は毎レンダリング新しい配列になり得るので、内容で購読キーを作る
  const tagKey = useMemo(() => [...tags].sort().join("|"), [tags]);
  const myTags = useMemo(
    () => (tagKey ? tagKey.split("|").slice(0, TAG_QUERY_LIMIT) : []),
    [tagKey],
  );
  // 管理者かどうかが変わったら（クレームの取り直し）、別の一覧として読み直す
  const key = isAdmin ? `admin:${tagKey}` : tagKey;
  // 読める状態か（管理者はタグが無くても読める）
  const ready = isAdmin || myTags.length > 0;
  /** 一覧のクエリの条件。管理者はタグで絞らない（上の★参照） */
  const scope = useMemo(
    () => [
      where("status", "==", "visible"),
      ...(isAdmin ? [] : [where("visibleToTags", "array-contains-any", myTags)]),
    ],
    [isAdmin, myTags],
  );

  /**
   * ★結果はすべて購読キー（タグの組）と一緒に持つ★
   *   タグが変わったら、描画時に「読み込み中・遡り分なし」へ戻る。
   *   見える範囲が変わったのに前のタグの投稿を出し続けないため。
   *   effect の中で setState してリセットすると描画が二重に走る。
   */
  const [live, setLive] = useState<{ key: string; nonce: number; posts: Post[] } | null>(null);
  const [older, setOlder] = useState<{ key: string; posts: Post[]; exhausted: boolean } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; error: FirestoreError | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const busy = useRef(false);

  // 引っ張って更新で購読を張り直すための番号。refresh() が増やす
  const [nonce, setNonce] = useState(0);
  const nonceRef = useRef(0);
  const lastRefreshAt = useRef(-Infinity);
  const waiters = useRef<{ nonce: number; resolve: () => void }[]>([]);

  useEffect(() => {
    if (!ready) return;

    // この購読の最初の結果が届いたら、それを待っている refresh() を終える
    const settle = () => {
      waiters.current = waiters.current.filter((w) => {
        if (w.nonce > nonce) return true;
        w.resolve();
        return false;
      });
    };

    const q = query(
      collection(db, "posts"),
      ...scope,
      orderBy("createdAt", "desc"),
      limit(pageSize), // Rules の request.query.limit <= 50 と整合させること
    );

    return onSnapshot(
      q,
      (snap) => {
        setLive({ key, nonce, posts: snap.docs.map(toPost) });
        setErrorState({ key, error: null });
        settle();
      },
      (e) => {
        // 読めなくても読み込み中のままにしない
        setLive((l) => (l?.key === key ? l : { key, nonce, posts: [] }));
        setErrorState({ key, error: e });
        settle();
      },
    );
  }, [key, ready, scope, pageSize, nonce]);

  /**
   * 引っ張って更新。購読を張り直して最新の pageSize 件から読み直し、遡り分は捨てる。
   * ★張り直しのあいだも前の一覧を出し続ける★（live はタグの組だけで照合する）
   *   読み込み中の表示を挟むと、一覧が一瞬消えてちらつく。
   * 戻り値の Promise は、新しい購読の最初の結果が届いたら（または時間切れで）終わる。
   */
  const refresh = useCallback((): Promise<void> => {
    if (!ready) return Promise.resolve();
    const now = Date.now();
    if (now - lastRefreshAt.current < PULL_REFRESH_COOLDOWN_MS) return Promise.resolve();
    lastRefreshAt.current = now;

    const next = ++nonceRef.current;
    setNonce(next);
    setOlder(null);
    return new Promise<void>((resolve) => {
      waiters.current.push({ nonce: next, resolve });
      setTimeout(resolve, PULL_REFRESH_TIMEOUT_MS);
    });
  }, [ready]);

  const livePosts = live?.key === key ? live.posts : EMPTY;
  const olderPosts = older?.key === key ? older.posts : EMPTY;
  const exhausted = older?.key === key && older.exhausted;
  const loading = ready && live?.key !== key;
  const error = errorState?.key === key ? errorState.error : null;

  const posts = useMemo(() => {
    const map = new Map<string, Post>();
    for (const p of livePosts) map.set(p.id, p);
    for (const p of olderPosts) if (!map.has(p.id)) map.set(p.id, p);
    return [...map.values()].sort(byNewest);
  }, [livePosts, olderPosts]);

  const loadMore = useCallback(async () => {
    if (busy.current || exhausted || !ready) return;

    const last = posts[posts.length - 1];
    if (!last?.createdAt) return;

    busy.current = true;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "posts"),
          ...scope,
          orderBy("createdAt", "desc"),
          startAfter(last.createdAt),
          limit(pageSize),
        ),
      );
      const page = snap.docs.map(toPost);
      // 取得中にタグが変わっていたら、古いキーの分として捨てられる（表示には出ない）
      setOlder((o) => ({
        key,
        posts: [...(o?.key === key ? o.posts : []), ...page],
        exhausted: page.length < pageSize,
      }));
    } catch (e) {
      setErrorState({ key, error: e as FirestoreError });
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [exhausted, key, ready, scope, pageSize, posts]);

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
        ? { ...o, posts: o.posts.flatMap((p) => (p.id !== id ? [p] : fresh && fresh.status === "visible" ? [fresh] : [])) }
        : o,
    );
  }, []);

  return { posts, loading, loadingMore, hasMore: !exhausted, loadMore, refresh, syncPost, error };
}

const EMPTY: Post[] = [];
