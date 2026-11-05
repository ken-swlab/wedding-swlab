"use client";

import { Fragment } from "react";
import type { User } from "firebase/auth";
import type { FirestoreError } from "firebase/firestore";
import type { Post } from "@/types";
import { PostCard } from "./PostCard";
import { useOwnPostActions } from "@/hooks/useOwnPostActions";
import { useNearEnd } from "@/hooks/useNearEnd";
import { TIMELINE_PREFETCH_POSTS } from "@/config/guestbook";

export function Timeline({
  posts, loading, error, user, hasMore = false, loadingMore = false, onNearEnd,
}: {
  posts: Post[];
  loading: boolean;
  error: FirestoreError | null;
  user: User;
  /** 続きがあるか・読み込み中か・下に残りが少なくなったときに呼ぶ（Issue #251 の先読み） */
  hasMore?: boolean;
  loadingMore?: boolean;
  onNearEnd?: () => void;
}) {
  // 自分の投稿にだけ「⋯」（編集・削除。Issue #202）。削除したカードは購読で一覧から消える
  const own = useOwnPostActions(user);
  // ★下に残りが TIMELINE_PREFETCH_POSTS 件になった所に目印を置く★（Issue #251）
  //   一番下まで来てから読むと、電波が悪いときに待ち時間が見える。手前で読み始めて隠す
  const nearEnd = useNearEnd<HTMLDivElement>(!!onNearEnd && hasMore && !loading && !error, loadingMore, onNearEnd ?? NOOP);
  const markAt = Math.max(0, posts.length - TIMELINE_PREFETCH_POSTS);

  if (loading) {
    return (
      <div className="space-y-3">
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

  if (posts.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-stone-400">
        まだ投稿がありません。最初のメッセージを書いてみませんか。
      </p>
    );
  }

  return (
    // 投稿は罫線で区切るので、間は空けない（Issue #236）
    <div>
      {posts.map((p, i) => (
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
