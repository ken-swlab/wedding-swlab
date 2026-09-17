"use client";

import Image from "next/image";
import { useState } from "react";
import type { Post } from "@/types";
import { toggleReaction } from "@/lib/posts";
import { MediaGrid } from "./MediaGrid";
import { TagBadge } from "./TagBadge";

function relativeTime(post: Post): string {
  if (!post.createdAt) return "送信中…";
  const d = post.createdAt.toDate();
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  if (min < 1440) return `${Math.floor(min / 60)}時間前`;
  return d.toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
}

export function PostCard({ post, uid }: { post: Post; uid: string }) {
  const [reacted, setReacted] = useState(false);
  const [busy, setBusy] = useState(false);

  // 件数は onSnapshot が即座に返すので楽観更新はしない（ズレの元）
  async function onReact() {
    if (busy) return;
    setBusy(true);
    try {
      setReacted(await toggleReaction(post.id, uid));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
      <header className="flex items-start gap-3">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-stone-200">
          {post.authorPhotoURL && (
            <Image src={post.authorPhotoURL} alt="" fill sizes="40px" className="object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-semibold text-stone-900">{post.authorName}</p>
            <time className="shrink-0 text-xs text-stone-400">{relativeTime(post)}</time>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {post.visibleToTags.map((t) => <TagBadge key={t} id={t} />)}
          </div>
        </div>
      </header>

      {post.text && (
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-stone-800">
          {post.text}
        </p>
      )}

      <MediaGrid media={post.media} />

      <footer className="mt-3 flex items-center gap-4 border-t border-stone-100 pt-3">
        <button
          type="button"
          onClick={onReact}
          disabled={busy}
          aria-pressed={reacted}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition disabled:opacity-50 ${
            reacted ? "bg-rose-50 text-rose-600" : "text-stone-500 hover:bg-stone-50"
          }`}
        >
          <span aria-hidden>{reacted ? "❤️" : "🤍"}</span>
          <span className="tabular-nums">{post.reactionCount}</span>
        </button>
        <span className="text-sm text-stone-400">💬 {post.commentCount}</span>
      </footer>
    </article>
  );
}
