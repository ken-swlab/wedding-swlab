"use client";

import { Fragment, useEffect, useMemo, useRef } from "react";
import type { User } from "firebase/auth";
import type { FirestoreError } from "firebase/firestore";
import type { Post } from "@/types";
import { PostCard } from "./PostCard";
import { useOwnPostActions } from "@/hooks/useOwnPostActions";
import { useNearEnd } from "@/hooks/useNearEnd";
import { TIMELINE_PREFETCH_POSTS } from "@/config/guestbook";
import type { PostOutbox } from "@/hooks/usePostOutbox";
import { PendingPostCard } from "./PendingPostCard";
import { useLastVisible } from "@/hooks/useLastVisible";
import { currentConnection, nextRange, prefetchImage, timelinePrefetchCount } from "@/lib/prefetch";
import { feedSrc, posterSrc } from "@/lib/media-url";

export function Timeline({
  posts, loading, error, user, hasMore = false, loadingMore = false, onNearEnd, outbox,
}: {
  posts: Post[];
  loading: boolean;
  error: FirestoreError | null;
  user: User;
  /** 続きがあるか・読み込み中か・下に残りが少なくなったときに呼ぶ（Issue #251 の先読み） */
  hasMore?: boolean;
  loadingMore?: boolean;
  onNearEnd?: () => void;
  /**
   * 送信中の自分の投稿（Issue #254）。一番上に出す。
   * ★同じ ID の本物の投稿は出さない★ 書けたあとも、本物の写真を読み込み終わるまでは送信中の投稿を出し続け、
   *   列から外れたところで本物に替わる（同じ一番上の位置で中身だけが替わる）。
   */
  outbox?: PostOutbox | null;
}) {
  // 自分の投稿にだけ「⋯」（編集・削除。Issue #202）。削除したカードは購読で一覧から消える
  const own = useOwnPostActions(user);
  // ★下に残りが TIMELINE_PREFETCH_POSTS 件になった所に目印を置く★（Issue #251）
  //   一番下まで来てから読むと、電波が悪いときに待ち時間が見える。手前で読み始めて隠す
  const nearEnd = useNearEnd<HTMLDivElement>(!!onNearEnd && hasMore && !loading && !error, loadingMore, onNearEnd ?? NOOP);

  // 送信中の投稿（新郎新婦あては自分のタイムラインに出ないので除く）と、それと同じ ID の本物の投稿を除いた一覧
  const pending = useMemo(() => (outbox?.entries ?? []).filter((e) => !e.draft.coupleOnly), [outbox?.entries]);
  const visible = useMemo(() => {
    if (pending.length === 0) return posts;
    const ids = new Set(pending.map((e) => e.draft.postId));
    return posts.filter((p) => !ids.has(p.id));
  }, [posts, pending]);
  const markAt = Math.max(0, visible.length - TIMELINE_PREFETCH_POSTS);

  // ★見えている投稿の次の数件の写真を、先に読んでおく★（Issue #255）
  //   読むのは一覧の写真（feed。動画は1枚目の画像）だけ。全画面の写真（軽量版・原本）は押したときだけ。
  //   電波が悪いときは次の1件だけ（lib/prefetch.ts）。同じ写真は2回読まない。
  const list = useRef<HTMLDivElement>(null);
  const ids = useMemo(() => visible.map((p) => p.id), [visible]);
  const lastSeen = useLastVisible(list, "data-post-card", ids);
  useEffect(() => {
    for (const p of nextRange(visible, lastSeen, timelinePrefetchCount(currentConnection()))) {
      // 一覧に出すのは最初の4枚まで（MediaGrid）
      for (const m of p.media.slice(0, 4)) prefetchImage(m.type === "image" ? feedSrc(m) : posterSrc(m));
    }
  }, [visible, lastSeen]);
  const pendingCards = pending.map((e) => (
    <PendingPostCard
      key={e.draft.postId}
      entry={e}
      onRetry={() => outbox?.retry(e.draft.postId)}
      onCancel={() => outbox?.cancel(e.draft.postId)}
    />
  ));

  if (loading) {
    return (
      <div className="space-y-3">
        {pendingCards.length > 0 && <div>{pendingCards}</div>}
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-stone-200/60" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p className="font-medium">タイムラインを読み込めませんでした（{error.code}）</p>
        {error.code === "permission-denied" && (
          <p className="mt-1 leading-relaxed">
            クエリの <code>array-contains-any</code> と Rules の <code>canSee()</code> が
            噛み合っていない可能性があります。Custom Claims の tags もご確認ください。
          </p>
        )}
      </div>
    );
  }

  if (visible.length === 0 && pendingCards.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-stone-400">
        まだ投稿がありません。最初のメッセージを書いてみませんか。
      </p>
    );
  }

  return (
    // 投稿は罫線で区切るので、間は空けない（Issue #236）
    <div ref={list}>
      {pendingCards}
      {visible.map((p, i) => (
        <Fragment key={p.id}>
          {i === markAt && <div ref={nearEnd} aria-hidden="true" />}
          <PostCard post={p} user={user} actions={own.actionsFor(p)} />
        </Fragment>
      ))}
      {own.editor}
    </div>
  );
}

const NOOP = () => {};
