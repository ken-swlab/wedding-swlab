"use client";

import { type RefObject } from "react";
import { isSwipeExempt, prefersReducedMotion, useSwipe, type SwipeAxis } from "./useSwipe";
import {
  MOTION_EASING,
  SHEET_COLLAPSE_MS,
  SWIPE_DISMISS_RATIO,
  SWIPE_FLICK_VELOCITY,
} from "@/config/guestbook";

/** 指について動かす（DOM を直接書き換える。描き直しを毎フレーム起こさないため） */
function setShift(el: HTMLElement, dx: number | null) {
  el.style.transform = dx === null ? "" : `translate3d(${Math.max(0, dx)}px, 0, 0)`;
}

/**
 * 画面のどこからでも右へスワイプしたら前の画面へ戻る（投稿の詳細画面用）。
 *
 *   listen: 指を受け付ける範囲。move: 指について横へ動かす要素。
 *   ★move に fixed の要素（ヘッダー・ボトムナビ）を含めない★
 *     transform の付いた要素の中では fixed が画面ではなくその要素に固定され、ナビが飛ぶ。
 *
 * 端末標準の「左端からのスワイプ」と違い、画面の中ほどから軽く払っても戻れる。
 * 縦の操作はブラウザのスクロールに任せる（listen に touch-action: pan-y を付けること）。
 */
export function useSwipeBack(
  listen: RefObject<HTMLElement | null>,
  move: RefObject<HTMLElement | null>,
  onBack: () => void,
  opts: { blockNative?: (axis: SwipeAxis, delta: number) => boolean; enabled?: boolean } = {},
) {
  useSwipe(
    listen,
    {
      // 再生中の動画の上の横の操作はシークバーのもの
      canStart: (t) => !isSwipeExempt(t) && !t.closest("video[controls]"),
      accept: (axis, d) => axis === "x" && d > 0,
      blockNative: opts.blockNative,
      onMove: ({ dx }) => {
        const el = move.current;
        if (el) setShift(el, dx);
      },
      onEnd: ({ dx, velocity }) => {
        const el = move.current;
        if (!el) return;
        const width = el.getBoundingClientRect().width || window.innerWidth;
        const go = dx > width * SWIPE_DISMISS_RATIO || (dx > 0 && velocity > SWIPE_FLICK_VELOCITY);
        const from = `translate3d(${Math.max(0, dx)}px, 0, 0)`;
        setShift(el, null);
        if (!go) {
          if (dx > 0) {
            el.animate([{ transform: from }, { transform: "none" }], {
              duration: SHEET_COLLAPSE_MS,
              easing: MOTION_EASING,
            });
          }
          return;
        }
        if (prefersReducedMotion()) {
          onBack();
          return;
        }
        // 画面の外まで送り切ってから戻る。戻るまでの間は外に置いたままにする（fill）
        const anim = el.animate(
          [{ transform: from }, { transform: `translate3d(${window.innerWidth}px, 0, 0)` }],
          { duration: SHEET_COLLAPSE_MS, easing: MOTION_EASING, fill: "forwards" },
        );
        anim.onfinish = onBack;
      },
    },
    opts.enabled ?? true,
  );
}
