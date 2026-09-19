"use client";

import Image from "next/image";
import { useMemo } from "react";
import type { Post } from "@/types";

export type GalleryEntry = {
  post: Post;
  coverUrl: string;
  isVideo: boolean;
  count: number;
};

/**
 * ★グリッドの単位は「投稿」★
 *   いいねが投稿単位で付くため、グリッドを画像単位に割ると
 *   エンドロールの「いいね順」の集計基準がぶれる。
 *   複数枚の投稿は1枚目をカバーにし、右上にアイコンを出す。
 */
export function buildEntries(posts: Post[]): GalleryEntry[] {
  return posts
    .filter((p) => p.media.length > 0)
    .map((p) => ({
      post: p,
      coverUrl: p.media[0].url,
      isVideo: p.media[0].type === "video",
      count: p.media.length,
    }));
}

export function GalleryGrid({
  posts,
  onOpen,
  footer,
}: {
  posts: Post[];
  onOpen: (postId: string) => void;
  footer?: React.ReactNode;
}) {
  const entries = useMemo(() => buildEntries(posts), [posts]);

  if (entries.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-400">
        まだ写真がありません。
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-stone-200">
        {entries.map(({ post, coverUrl, isVideo, count }) => (
          <button
            key={post.id}
            type="button"
            onClick={() => onOpen(post.id)}
            className="group relative aspect-square bg-stone-100"
          >
            {isVideo ? (
              <video src={coverUrl} muted playsInline preload="metadata"
                className="h-full w-full object-cover" />
            ) : (
              <Image
                src={coverUrl}
                alt=""
                fill
                sizes="33vw"
                className="object-cover transition duration-200 group-active:brightness-90"
              />
            )}

            {/* 複数枚 / 動画のインジケータ */}
            {(count > 1 || isVideo) && (
              <span className="absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                {isVideo ? (
                  <span className="text-sm">▶</span>
                ) : (
                  <span className="block h-3.5 w-3.5 rounded-[3px] border-[1.5px] border-white shadow-[2px_-2px_0_-0.5px_rgba(0,0,0,0.3),2px_-2px_0_0_white]" />
                )}
              </span>
            )}

            {/* いいね数。エンドロールの並び順の materia になるので見せる */}
            {post.reactionCount > 0 && (
              <span className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 text-[11px] font-medium text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                ❤️ <span className="tabular-nums">{post.reactionCount}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      {footer}
    </div>
  );
}
