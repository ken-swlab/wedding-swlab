"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, startAfter, where, writeBatch,
  type DocumentData, type FirestoreError, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toComment } from "@/lib/comments";
import { NOTIFICATIONS_PAGE_SIZE, UNREAD_BADGE_LIMIT } from "@/config/mentions";
import type { AppNotification, Comment } from "@/types";

/**
 * 通知（notifications/{自分の uid}/items。Issue #92）。
 *
 * ★読めるのは自分の分だけ★ Rules は uid == 自分 のパスだけを許す。作るのはサーバーだけで、
 *   クライアントが書けるのは read を true にする更新だけ（markNotificationsRead）。
 * ★limit は Rules の上限（50）以下にする★
 * 並べ替えは createdAt だけ、未読の数は read == false だけなので、複合インデックスは要らない。
 */
function items(uid: string) {
  return collection(db, "notifications", uid, "items");
}

function toNotification(snap: QueryDocumentSnapshot<DocumentData>): AppNotification {
  const d = snap.data();
  return {
    id: snap.id,
    type: "mention",
    fromUid: typeof d.fromUid === "string" ? d.fromUid : "",
    fromName: typeof d.fromName === "string" && d.fromName ? d.fromName : "ゲスト",
    postId: typeof d.postId === "string" ? d.postId : "",
    commentId: typeof d.commentId === "string" ? d.commentId : undefined,
    createdAt: d.createdAt ?? null,
    read: d.read === true,
  };
}

/**
 * 未読の件数（ボトムナビの丸い数字）。UNREAD_BADGE_LIMIT 件までしか数えない
 * （届いた数が上限と同じなら「9+」と出す。GuestbookShell）。
 */
export function useUnreadNotificationCount(uid: string | null): number {
  const [state, setState] = useState<{ uid: string; count: number } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(items(uid), where("read", "==", false), limit(UNREAD_BADGE_LIMIT)),
      (snap) => setState({ uid, count: snap.size }),
      (e) => {
        // 数字が出ないだけで、ほかの操作は続けられる
        console.error(e);
        setState({ uid, count: 0 });
      },
    );
  }, [uid]);

  return state && state.uid === uid ? state.count : 0;
}

/**
 * 通知の一覧（新しい順）。直近 pageSize 件はリアルタイム購読、それ以前は loadMore() で継ぎ足す
 * （useMyPosts と同じ構成）。
 */
export function useNotifications(uid: string | null, pageSize = NOTIFICATIONS_PAGE_SIZE) {
  const [live, setLive] = useState<{ uid: string; list: AppNotification[] } | null>(null);
  const [older, setOlder] = useState<{ uid: string; list: AppNotification[]; exhausted: boolean } | null>(null);
  const [errorState, setErrorState] = useState<{ uid: string; error: FirestoreError | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(items(uid), orderBy("createdAt", "desc"), limit(pageSize)),
      (snap) => {
        setLive({ uid, list: snap.docs.map(toNotification) });
        setErrorState({ uid, error: null });
      },
      (e) => {
        console.error(e);
        // 読めなくても読み込み中のままにしない
        setLive((l) => (l?.uid === uid ? l : { uid, list: [] }));
        setErrorState({ uid, error: e });
      },
    );
  }, [uid, pageSize]);

  const liveList = live && live.uid === uid ? live.list : EMPTY;
  const olderList = older && older.uid === uid ? older.list : EMPTY;
  const olderDone = !!older && older.uid === uid && older.exhausted;
  const loading = !!uid && live?.uid !== uid;
  const error = errorState && errorState.uid === uid ? errorState.error : null;
  const hasMore = !loading && !olderDone && (olderList.length > 0 || liveList.length >= pageSize);

  const notifications = useMemo(() => {
    const map = new Map<string, AppNotification>();
    for (const n of liveList) map.set(n.id, n);
    for (const n of olderList) if (!map.has(n.id)) map.set(n.id, n);
    return [...map.values()].sort(
      (a, b) => (b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER) - (a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER),
    );
  }, [liveList, olderList]);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore || !uid) return;
    const last = notifications[notifications.length - 1];
    if (!last?.createdAt) return;

    busy.current = true;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(items(uid), orderBy("createdAt", "desc"), startAfter(last.createdAt), limit(pageSize)),
      );
      const page = snap.docs.map(toNotification);
      setOlder((o) => ({
        uid,
        list: [...(o?.uid === uid ? o.list : []), ...page],
        exhausted: page.length < pageSize,
      }));
    } catch (e) {
      console.error(e);
      setErrorState({ uid, error: e as FirestoreError });
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, notifications, pageSize, uid]);

  return { notifications, loading, loadingMore, hasMore, loadMore, error };
}

const EMPTY: AppNotification[] = [];

/**
 * 通知を既読にする。★変えるのは read だけ、値は true だけ★（Rules がそれ以外の更新を拒む）。
 */
export async function markNotificationsRead(uid: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  for (const id of ids) batch.update(doc(items(uid), id), { read: true });
  await batch.commit();
}

/**
 * メンションされたコメント1件を読む（通知の一覧に内容を出すため。購読はしない）。
 * 消された・読めない・親の投稿ごと非表示になったコメントは、区別せず comment: null にする。
 */
export function useMentionedComment(postId: string, commentId: string | undefined, enabled: boolean) {
  const key = commentId ? `${postId}/${commentId}` : "";
  const [state, setState] = useState<{ key: string; comment: Comment | null } | null>(null);

  useEffect(() => {
    if (!enabled || !commentId) return;
    let alive = true;
    getDoc(doc(db, "posts", postId, "comments", commentId))
      .then((snap) => {
        if (!alive) return;
        const comment = snap.exists() ? toComment(snap as QueryDocumentSnapshot<DocumentData>) : null;
        setState({ key, comment: comment && !comment.hidden ? comment : null });
      })
      .catch(() => {
        if (alive) setState({ key, comment: null });
      });
    return () => {
      alive = false;
    };
  }, [postId, commentId, enabled, key]);

  if (!enabled || !commentId) return { comment: null, loading: false };
  if (state?.key !== key) return { comment: null, loading: true };
  return { comment: state.comment, loading: false };
}
