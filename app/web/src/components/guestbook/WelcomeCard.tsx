"use client";

import Image from "next/image";
import type { MouseEvent, ReactNode } from "react";
import { thumbSrc } from "@/lib/media-url";
import { WELCOME_AUTHOR_NAME, WELCOME_PLACEHOLDER_IMAGE } from "@/config/welcome";
import type { WelcomeContent } from "@/types/welcome";
import { HeartIcon } from "./HeartIcon";

/**
 * 承認後の初回の演出に出す投稿カード（Issue #150）。見た目は PostCard（タイムライン）に合わせる。
 *
 * ★PostCard を使わず、見た目だけをなぞる★ 仮の画像のときは Firestore に投稿が無く、PostCard の
 *   いいね・詳細シート・投稿者の購読が動かせないため。本物の投稿でも、演出の直後に並べる間だけこれを使い、
 *   再読み込みのあとは通常の PostCard に戻る。
 * photoOverlay: 写真の上に重ねるもの（ダブルタップのハートの層）。写真の箱は position: relative。
 */
export function WelcomeCard({
  content,
  liked,
  photoOverlay,
  onPhotoClick,
}: {
  content: WelcomeContent;
  liked: boolean;
  photoOverlay?: ReactNode;
  onPhotoClick?: (e: MouseEvent<HTMLDivElement>) => void;
}) {
  // URL を組み立てられない（配信元の設定が無い・古いデータ）ときは仮の画像にする（空の src を描かない）
  const src = (content.media && thumbSrc(content.media)) || WELCOME_PLACEHOLDER_IMAGE;
  const count = content.reactionCount + (liked ? 1 : 0);
  return (
    <article className="rounded-2xl border border-stone-200/80 bg-white p-4 text-left shadow-sm">
      <header className="flex items-start gap-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-50 text-accent-500">
          {content.authorPhotoURL ? (
            <Image src={content.authorPhotoURL} alt="" fill sizes="40px" className="object-cover" unoptimized />
          ) : (
            <HeartIcon filled />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-semibold text-stone-900">{WELCOME_AUTHOR_NAME}</p>
            <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-stone-400">たった今</span>
          </div>
        </div>
      </header>

      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-stone-800">{content.message}</p>

      <div
        onClick={onPhotoClick}
        data-welcome-photo=""
        className="relative mt-3 aspect-[4/3] touch-manipulation select-none overflow-hidden rounded-xl bg-stone-100"
        style={{ WebkitTouchCallout: "none" }}
      >
        <Image src={src} alt="新郎新婦からの写真" fill sizes="(max-width: 640px) 100vw, 576px" className="object-cover" unoptimized draggable={false} />
        {photoOverlay}
      </div>

      <footer className="mt-3 border-t border-stone-100 pt-2">
        <div className="flex items-center gap-1">
          <span
            aria-label={`いいね ${count}件${liked ? "（いいね済み）" : ""}`}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
              liked ? "bg-accent-50 text-accent-600" : "text-stone-500"
            }`}
          >
            <HeartIcon filled={liked} />
            <span className="tabular-nums">{count}</span>
          </span>
          <span className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-stone-500">💬 コメントする</span>
        </div>
      </footer>
    </article>
  );
}

/**
 * タイムラインの一番上に固定して出す、演出の直後の投稿（Issue #150）。小さく「新郎新婦から」のラベル。
 * ★演出の直後の表示に限る★ 呼び出し側の state だけで持ち、再読み込みすると通常の並びに戻る。
 * hidden の間は場所だけ取って見せない（演出のカードが、ここへ縮みながら移ってくる）。
 */
export function WelcomePinned({ content, hidden }: { content: WelcomeContent; hidden: boolean }) {
  return (
    <div data-welcome-pin="" className={hidden ? "invisible" : ""}>
      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-accent-600">
        <HeartIcon filled />
        新郎新婦から
      </p>
      <WelcomeCard content={content} liked />
    </div>
  );
}
