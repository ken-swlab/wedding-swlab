"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { BoundingBox } from "@/types/faces";

export function FaceThumbnail({
  src,
  box,
  size = 96,
  padding = 0.5,
  className,
}: {
  src: string;
  box: BoundingBox;
  size?: number;
  padding?: number;
  className?: string;
}) {
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);

  const style = useMemo<CSSProperties>(() => {
    if (!dim || dim.w === 0 || dim.h === 0) return { opacity: 0 };

    const bw = box.Width * dim.w;
    const bh = box.Height * dim.h;
    let cx = (box.Left + box.Width / 2) * dim.w;
    let cy = (box.Top + box.Height / 2) * dim.h;

    const side = Math.max(bw, bh) * (1 + padding);
    const half = side / 2;

    if (dim.w > side) cx = Math.min(Math.max(cx, half), dim.w - half);
    if (dim.h > side) cy = Math.min(Math.max(cy, half), dim.h - half);

    const scale = size / side;

    return {
      position: "absolute",
      width: dim.w * scale,
      height: dim.h * scale,
      left: size / 2 - cx * scale,
      top: size / 2 - cy * scale,
      maxWidth: "none",
      opacity: 1,
      transition: "opacity 150ms",
    };
  }, [dim, box, size, padding]);

  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-full bg-stone-200 ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        onLoad={(e) =>
          setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
        }
        style={style}
      />
    </span>
  );
}

export function FaceContext({ src, box }: { src: string; box: BoundingBox }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-h-[52vh] w-full object-contain" />
      <span
        className="pointer-events-none absolute rounded-md border-2 border-amber-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
        style={{
          left: `${box.Left * 100}%`,
          top: `${box.Top * 100}%`,
          width: `${box.Width * 100}%`,
          height: `${box.Height * 100}%`,
        }}
      />
    </div>
  );
}
