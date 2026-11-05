"use client";

import { useMemo } from "react";
import type { Post } from "@/types";
import { gridSrc, posterSrc, thumbSrc } from "@/lib/media-url";
import { HeartIcon } from "./HeartIcon";
import { PlayIcon } from "@/components/icons";
import { PlaceholderImage } from "./PlaceholderImage";

export type GalleryEntry = {
  post: Post;
  coverUrl: string;
  isVideo: boolean;
  /** 動画の1枚目の画像があるか（あれば coverUrl はその画像で、動画本体は読まない。Issue #251） */
  videoHasPoster: boolean;
  /** 1枚目の下絵（Issue #253）。無ければ灰色の枠のまま */
  placeholder?: string;
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
      // ギャラリーの格子は長辺 400px の小さい版（Issue #251）。動画は1枚目の画像（無ければ動画を読む）
      coverUrl: p.media[0].type === "video" ? posterSrc(p.media[0]) ?? thumbSrc(p.media[0]) : gridSrc(p.media[0]),
      videoHasPoster: p.media[0].type === "video" && posterSrc(p.media[0]) !== null,
      isVideo: p.media[0].type === "video",
      placeholder: p.media[0].placeholder,
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
      <p className="py-10 text-center text-sm text-stone-400">
        まだ写真がありません。
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-stone-200">
        {entries.map(({ post, coverUrl, isVideo, videoHasPoster, placeholder, count }) => (
          <button
            key={post.id}
            type="button"
            onClick={() => onOpen(post.id)}
            className="group relative aspect-square bg-stone-100"
          >
            {isVideo && !videoHasPoster ? (
              <video src={coverUrl} muted playsInline preload="metadata"
                className="h-full w-full object-cover" />
            ) : (
              <PlaceholderImage
                src={coverUrl}
                placeholder={placeholder}
                alt=""
                sizes="33vw"
                className="object-cover transition duration-200 group-active:brightness-90"
              />
            )}

            {/* 複数枚 / 動画のインジケータ */}
            {(count > 1 || isVideo) && (
              <span className="absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                {isVideo ? (
                  <PlayIcon className="h-3.5 w-3.5" />
                ) : (
                  <span className="block h-3.5 w-3.5 rounded-[3px] border-[1.5px] border-white shadow-[2px_-2px_0_-0.5px_rgba(0,0,0,0.3),2px_-2px_0_0_white]" />
                )}
              </span>
            )}

            {/* いいね数。エンドロールの並び順の materia になるので見せる */}
            {post.reactionCount > 0 && (
              <span className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 text-[length:calc(11px*var(--inv-scale))] font-medium text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                <HeartIcon filled className="h-3 w-3" /> <span className="tabular-nums">{post.reactionCount}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      {footer}
    </div>
  );
}
