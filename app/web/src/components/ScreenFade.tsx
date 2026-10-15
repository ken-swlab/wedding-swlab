"use client";

import { useEffect, useState } from "react";
import { clearDarkExit, peekDarkExit, type DarkExit } from "@/lib/screen-transition";

/**
 * 黒い画面から明るい画面に移った直後に、暗転から浮かび上がらせる（Issue #157 B-5）。
 *   dark     … 黒が 0.45 秒で溶ける（オープニング → 招待状、承認待ち → 回答の修正）
 *   approved … 黒の真ん中から光が広がって、明るい画面になる（承認待ち → ゲストブック）
 * ★押せない幕★ pointer-events: none。動き終わったら外す。動かすのは opacity と transform だけ。
 *   prefers-reduced-motion では光の広がりを省き、溶けるだけにする（globals.css）。
 */
export function ScreenFade({ from }: { from: DarkExit | null }) {
  const [on, setOn] = useState(from !== null);
  if (!on || !from) return null;
  return (
    <div aria-hidden className="screen-fade pointer-events-none fixed inset-0 z-[200] bg-black" onAnimationEnd={(e) => e.target === e.currentTarget && setOn(false)}>
      {from === "approved" && <div className="screen-fade-glow absolute left-1/2 top-1/2 h-[60vmax] w-[60vmax] rounded-full bg-white" />}
    </div>
  );
}

/** 黒い画面から来たか（markDarkExit の印）。最初の描画で決め、読んだ印は消す */
export function useDarkEntry(): DarkExit | null {
  const [from] = useState(peekDarkExit);
  useEffect(() => clearDarkExit(), []);
  return from;
}
