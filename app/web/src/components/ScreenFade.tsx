"use client";

import { useEffect, useState, type AnimationEvent } from "react";
import { APPROVED_MESSAGE_TOP, CURTAIN_EASING, OPENING_COLORS, OPENING_TIMING } from "@/config/opening";
import { clearDarkExit, peekDarkExit, type DarkExit } from "@/lib/screen-transition";

/** 幕の下端の丸み (px)。幕と一緒に上へ動く */
const CURTAIN_EDGE_PX = 26;

/**
 * 黒い画面から明るい画面に移った直後に、暗転から浮かび上がらせる（Issue #157 B-5）。
 *   dark     … 黒が 0.45 秒で溶ける（オープニングをスキップ → 招待状、承認待ち → 回答の修正）
 *   approved … 「承認されました」の黒い画面が、上へ開く幕のように動き、下から明るい画面が現れる
 *              （承認待ち → ゲストブック。Issue #165）。幕の下端はゆるく丸める
 * ★押せない幕★ pointer-events: none。動き終わったら外す。動かすのは opacity と transform だけ。
 *   prefers-reduced-motion では、幕を動かさず溶けるだけにする（globals.css）。
 */
export function ScreenFade({ from }: { from: DarkExit | null }) {
  const [on, setOn] = useState(from !== null);
  if (!on || !from) return null;
  const end = (e: AnimationEvent) => e.target === e.currentTarget && setOn(false);
  if (from === "approved") {
    return (
      <div
        aria-hidden
        className="screen-curtain pointer-events-none fixed inset-0 z-[200] bg-black text-center"
        style={{ animationDuration: `${OPENING_TIMING.curtainOpen}ms`, animationTimingFunction: CURTAIN_EASING }}
        onAnimationEnd={end}
      >
        {/* 承認待ち（PendingApproval）の「承認されました」と同じ位置・大きさ */}
        <p className="absolute inset-x-0 px-6 text-2xl font-bold tracking-wide" style={{ top: APPROVED_MESSAGE_TOP, color: OPENING_COLORS.ink }}>
          承認されました
        </p>
        <div className="absolute inset-x-0 bg-black" style={{ bottom: -CURTAIN_EDGE_PX, height: CURTAIN_EDGE_PX, borderRadius: "0 0 50% 50% / 0 0 100% 100%" }} />
      </div>
    );
  }
  return <div aria-hidden className="screen-fade pointer-events-none fixed inset-0 z-[200] bg-black" onAnimationEnd={end} />;
}

/** 黒い画面から来たか（markDarkExit の印）。最初の描画で決め、読んだ印は消す */
export function useDarkEntry(): DarkExit | null {
  const [from] = useState(peekDarkExit);
  useEffect(() => clearDarkExit(), []);
  return from;
}
