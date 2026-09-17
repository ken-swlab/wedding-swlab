import Image from "next/image";
import type { MediaItem } from "@/types";

const COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-2", 4: "grid-cols-2" };

export function MediaGrid({ media }: { media: MediaItem[] }) {
  if (media.length === 0) return null;
  const items = media.slice(0, 4);

  return (
    <div className={`mt-3 grid gap-1 overflow-hidden rounded-xl ${COLS[items.length]}`}>
      {items.map((m, i) => (
        <div
          key={m.storagePath || `${m.url}-${i}`}
          className={[
            "relative bg-stone-100",
            items.length === 1 ? "aspect-[4/3]" : "aspect-square",
            // 3枚のときは1枚目を縦長に大きく見せる
            items.length === 3 && i === 0 ? "row-span-2 aspect-auto" : "",
          ].join(" ")}
        >
          {m.type === "video" ? (
            <video
              src={m.url}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
          ) : (
            <Image
              src={m.url}
              alt={m.alt ?? ""}
              fill
              sizes="(max-width: 640px) 100vw, 600px"
              className="object-cover"
            />
          )}
        </div>
      ))}
    </div>
  );
}
