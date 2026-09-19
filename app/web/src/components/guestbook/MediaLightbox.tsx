"use client";

import Image from "next/image";
import { useCallback, useEffect } from "react";
import type { MediaItem } from "@/types";

/**
 * 拡大表示。originalUrl があればそちらを出す。
 * 二段階アップロードの「原本」が意味を持つのがここ。
 */
export function MediaLightbox({
  media,
  index,
  onClose,
  onMove,
}: {
  media: MediaItem[];
  index: number;
  onClose: () => void;
  onMove: (next: number) => void;
}) {
  const item = media[index];

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onMove((index + 1) % media.length);
      if (e.key === "ArrowLeft") onMove((index - 1 + media.length) % media.length);
    },
    [index, media.length, onClose, onMove],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prev;
    };
  }, [handleKey]);

  if (!item) return null;
  const src = item.originalUrl ?? item.url;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white"
      >
        ×
      </button>

      <div className="relative h-full w-full" onClick={(e) => e.stopPropagation()}>
        {item.type === "video" ? (
          <video src={src} controls autoPlay playsInline className="h-full w-full object-contain" />
        ) : (
          <Image src={src} alt={item.alt ?? ""} fill sizes="100vw" className="object-contain" priority />
        )}
      </div>

      {media.length > 1 && (
        <>
          <button
            type="button"
            aria-label="前へ"
            onClick={(e) => { e.stopPropagation(); onMove((index - 1 + media.length) % media.length); }}
            className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="次へ"
            onClick={(e) => { e.stopPropagation(); onMove((index + 1) % media.length); }}
            className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
          >
            ›
          </button>
          <p className="absolute bottom-5 text-xs tabular-nums text-white/60">
            {index + 1} / {media.length}
          </p>
        </>
      )}

      {item.originalStatus === "pending" && (
        <p className="absolute bottom-12 rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/70">
          高画質版を送信中です
        </p>
      )}
    </div>
  );
}
