"use client";

import type { User } from "firebase/auth";
import type { FirestoreError } from "firebase/firestore";
import type { Post } from "@/types";
import { PostCard } from "./PostCard";

export function Timeline({
  posts, loading, error, user,
}: {
  posts: Post[];
  loading: boolean;
  error: FirestoreError | null;
  user: User;
}) {
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
      <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-400">
        まだ投稿がありません。最初のメッセージを書いてみませんか。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((p) => <PostCard key={p.id} post={p} user={user} />)}
    </div>
  );
}
