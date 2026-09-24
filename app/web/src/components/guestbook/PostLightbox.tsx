"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { toggleReaction } from "@/lib/posts";
import { useMyReaction } from "@/hooks/useMyReaction";
import { RichText } from "./RichText";
import { TagBadge } from "./TagBadge";
import { CommentArea } from "./CommentArea";
import type { Post } from "@/types";
import { bestSrc } from "@/lib/media-url";

function fullDate(post: Post) {
  if (!post.createdAt) return "";
  return post.createdAt.toDate().toLocaleString("ja-JP", {
    month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** 横スクロール + scroll-snap。ライブラリ無しでネイティブな指ざわりになる */
function MediaCarousel({ post }: { post: Post }) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div className="relative bg-black">
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        style={{ scrollbarWidth: "none" }}
      >
        {post.media.map((m, i) => (
          <div
            key={m.storagePath || `${m.url}-${i}`}
            className="relative h-[52vh] w-full shrink-0 snap-center"
          >
            {m.type === "video" ? (
              <video src={bestSrc(m)} controls playsInline
                className="h-full w-full object-contain" />
            ) : (
              <Image
                // 原本があれば原本。比率はそのまま object-contain で見せる
                src={bestSrc(m)}
                alt={m.alt ?? ""}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-contain"
              />
            )}
          </div>
        ))}
      </div>

      {post.media.length > 1 && (
        <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5">
          {post.media.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition ${
                i === active ? "bg-white" : "bg-white/35"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PostLightbox({
  post,
  user,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
}: {
  post: Post;
  user: User;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { reacted, setReacted, loaded } = useMyReaction(post.id, user.uid, true);
  const [busy, setBusy] = useState(false);

  /**
   * click と touchend の両方を受けるため、1回だけ閉じるようにガードする。
   * iOS では状況によって click が飛ばないことがあるので、両方に繋ぐ。
   */
  const closedRef = useRef(false);
  useEffect(() => {
    closedRef.current = false;
  }, [post.id]);
  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  }, [onClose]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft" && hasPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext) onNext();
    },
    [hasPrev, hasNext, onPrev, onNext, close],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onKey]);

  async function onLike() {
    if (busy || !loaded) return;
    setBusy(true);
    try {
      setReacted(await toggleReaction(post.id, user.uid));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95">
      <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col">
        {/* LINE 内ブラウザやノッチの下にヘッダーが潜り込むと、
            ボタンが見えていてもタップがブラウザ側に吸われる */}
        <header
          className="flex shrink-0 items-center gap-3 px-4 pb-3"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-stone-700">
            {post.authorPhotoURL && (
              <Image src={post.authorPhotoURL} alt="" fill sizes="32px" className="object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{post.authorName}</p>
            <p className="text-[11px] text-white/40">{fullDate(post)}</p>
          </div>
          <button
            type="button"
            onClick={close}
            onTouchEnd={close}
            aria-label="閉じる"
            className="relative z-20 flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/15 text-2xl leading-none text-white transition active:bg-white/35"
          >
            ×
          </button>
        </header>

        <div className="relative flex-1 overflow-y-auto overscroll-contain">
          <MediaCarousel post={post} />

          <div className="min-h-full bg-stone-50 px-4 pb-10 pt-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void onLike()}
                disabled={busy || !loaded}
                aria-pressed={reacted}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm transition disabled:opacity-50 ${
                  reacted ? "bg-rose-50 text-rose-600" : "text-stone-500 hover:bg-stone-100"
                }`}
              >
                <span aria-hidden className="text-lg leading-none">
                  {reacted ? "❤️" : "🤍"}
                </span>
                <span className="tabular-nums font-medium">{post.reactionCount}</span>
              </button>

              <div className="ml-auto flex flex-wrap gap-1">
                {post.visibleToTags.map((t) => <TagBadge key={t} id={t} />)}
              </div>
            </div>

            {post.text && (
              <RichText
                text={post.text}
                className="mt-3 block whitespace-pre-wrap break-words text-[15px] leading-relaxed text-stone-800"
              />
            )}

            <div className="mt-2">
              <CommentArea post={post} user={user} defaultOpen />
            </div>
          </div>
        </div>

        {/* 前後の投稿。キーボードの ← → でも動く */}
        {hasPrev && (
          <button
            type="button"
            onClick={onPrev}
            aria-label="前の投稿"
            className="fixed left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-xl text-white backdrop-blur"
          >
            ‹
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={onNext}
            aria-label="次の投稿"
            className="fixed right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-xl text-white backdrop-blur"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
