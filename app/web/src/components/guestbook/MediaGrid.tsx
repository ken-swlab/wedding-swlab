"use client";

import Image from "next/image";
import { useState } from "react";
import type { MediaItem, OriginalStatus } from "@/types";
import { MediaLightbox } from "./MediaLightbox";
import { displayStatus } from "@/lib/original-status";

/** 枚数ごとのレイアウト。3枚のときだけ1枚目を大きく見せる */
function cellClass(count: number, i: number) {
  if (count === 1) return "col-span-2 aspect-[4/3]";
  if (count === 2) return "aspect-square";
  if (count === 3) return i === 0 ? "row-span-2 h-full" : "aspect-square";
  return "aspect-square";
}

type Badge = { label: string; className: string } | null;

/**
 * 原本の状態バッジ。
 *
 * ★Record を全キー必須にしてある★
 *   Partial だと OriginalStatus に値を足したときに、
 *   何も表示されないまま型チェックも通ってしまう。
 *   ここをコンパイルエラーにするのが目的。
 */
const BADGE: Record<OriginalStatus, Badge> = {
  pending: { label: "高画質版 未送信", className: "bg-amber-500/80 text-white" },
  // R2 には届いたが EXIF 除去がまだ。originalUrl は無いので HQ と言ってはいけない
  uploaded: { label: "高画質版 処理中", className: "bg-sky-600/75 text-white" },
  published: { label: "HQ", className: "bg-black/45 text-white/90" },
  skipped: { label: "軽量版のみ", className: "bg-black/55 text-white/80" },
  failed: { label: "軽量版のみ", className: "bg-black/55 text-white/80" },
  unavailable: { label: "軽量版のみ", className: "bg-black/55 text-white/80" },
};

export function MediaGrid({ media }: { media: MediaItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (media.length === 0) return null;

  const items = media.slice(0, 4);

  return (
    <>
      <div
        className={`mt-3 grid grid-cols-2 gap-1 overflow-hidden rounded-xl ${
          items.length === 3 ? "grid-rows-2" : ""
        }`}
      >
        {items.map((m, i) => (
          <button
            key={m.storagePath || `${m.url}-${i}`}
            type="button"
            onClick={() => setOpen(i)}
            className={`group relative overflow-hidden bg-stone-100 ${cellClass(items.length, i)}`}
          >
            {m.type === "video" ? (
              <>
                <video src={m.url} muted playsInline preload="metadata"
                  className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center text-3xl text-white/90 drop-shadow">
                  ▶
                </span>
              </>
            ) : (
              <Image
                src={m.url}
                alt={m.alt ?? ""}
                fill
                sizes="(max-width: 640px) 50vw, 300px"
                className="object-cover transition duration-300 group-hover:scale-[1.03]"
              />
            )}

            {displayStatus(m) && BADGE[displayStatus(m)!] && (
              <span
                className={`absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] ${
                  BADGE[displayStatus(m)!]!.className
                }`}
              >
                {BADGE[displayStatus(m)!]!.label}
              </span>
            )}
          </button>
        ))}
      </div>

      {open !== null && (
        <MediaLightbox
          media={items}
          index={open}
          onClose={() => setOpen(null)}
          onMove={setOpen}
        />
      )}
    </>
  );
}
