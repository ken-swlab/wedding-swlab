"use client";

import Image from "next/image";
import { useState } from "react";
import type { MediaItem } from "@/types";
import { MediaLightbox } from "./MediaLightbox";

/** 枚数ごとのレイアウト。3枚のときだけ1枚目を大きく見せる */
function cellClass(count: number, i: number) {
  if (count === 1) return "col-span-2 aspect-[4/3]";
  if (count === 2) return "aspect-square";
  if (count === 3) return i === 0 ? "row-span-2 h-full" : "aspect-square";
  return "aspect-square";
}

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

            {m.originalStatus === "pending" && (
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
                高画質版 送信中
              </span>
            )}
            {m.originalStatus === "uploaded" && (
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] text-white/90">
                HQ
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
