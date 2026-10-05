"use client";

import { useEffect, useRef, type RefObject } from "react";
import { SWIPE_SLOP_PX } from "@/config/guestbook";

export type SwipeAxis = "x" | "y";

export type SwipeState = {
  axis: SwipeAxis;
  /** 決まった軸の移動量だけが入る（もう片方は 0） */
  dx: number;
  dy: number;
  /** 決まった軸の向きの速さ (px/ms)。指を止めてから離したら 0 */
  velocity: number;
};

export type SwipeHandlers = {
  /** このタッチを扱うか（入力欄の中などは除く） */
  canStart?: (target: Element) => boolean;
  /** 縦横が決まったときに、この操作を引き受けるか。false ならブラウザに任せる */
  accept: (axis: SwipeAxis, delta: number) => boolean;
  /** 引き受けなかった操作でも touchmove を止めるか（LINE のシートが閉じるのを防ぐ） */
  blockNative?: (axis: SwipeAxis, delta: number) => boolean;
  onMove: (s: SwipeState) => void;
  onEnd: (s: SwipeState) => void;
};

/** 指を止めてからこれ以上たって離したら、払ったのではなく置いたとみなす (ms) */
const STALE_VELOCITY_MS = 100;
/** スワイプの直後に来る click を無視する時間 (ms) */
const CLICK_GUARD_MS = 350;

/**
 * 1本指のスワイプを縦横どちらかに決めてから伝える。
 *
 * ★touchmove は passive: false で要素に直接登録する★
 *   React の onTouchMove は passive で登録されるため preventDefault が効かず、
 *   LINE の iOS 版ではアプリ内ブラウザのシートごと閉じたり、裏のページが動いたりする。
 * ★2本指（ピンチ）や拡大表示中は扱わない★ ピンチで拡大した写真を見回す指の動きを奪わないため。
 *
 * 戻り値は「直前にスワイプしたか」。スワイプの指を離したときの click をタップと取り違えないために使う。
 */
export function useSwipe(
  ref: RefObject<HTMLElement | null>,
  handlers: SwipeHandlers,
  enabled = true,
): () => boolean {
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });
  const swipedAt = useRef(-Infinity);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let start: { x: number; y: number } | null = null;
    let axis: SwipeAxis | null = null;
    let taken = false;
    let last = { pos: 0, t: 0 };
    let state: SwipeState = { axis: "x", dx: 0, dy: 0, velocity: 0 };

    function reset() {
      start = null;
      axis = null;
      taken = false;
    }

    function finish(s: SwipeState) {
      const wasTaken = taken;
      reset();
      if (!wasTaken) return;
      swipedAt.current = performance.now();
      h.current.onEnd(s);
    }

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        // 2本目の指が来たらピンチに任せ、引いていた分は元に戻させる
        finish({ ...state, dx: 0, dy: 0, velocity: 0 });
        return;
      }
      reset();
      if ((window.visualViewport?.scale ?? 1) > 1.01) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target && h.current.canStart && !h.current.canStart(target)) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }

    function onMove(e: TouchEvent) {
      if (!start || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;

      if (!axis) {
        if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        taken = h.current.accept(axis, axis === "x" ? dx : dy);
        last = { pos: axis === "x" ? t.clientX : t.clientY, t: e.timeStamp };
      }

      const delta = axis === "x" ? dx : dy;
      if (!taken) {
        if (h.current.blockNative?.(axis, delta) && e.cancelable) e.preventDefault();
        return;
      }
      if (e.cancelable) e.preventDefault();

      const pos = axis === "x" ? t.clientX : t.clientY;
      const dt = e.timeStamp - last.t;
      const velocity = dt > 0 ? (pos - last.pos) / dt : state.velocity;
      last = { pos, t: e.timeStamp };
      state = { axis, dx: axis === "x" ? dx : 0, dy: axis === "y" ? dy : 0, velocity };
      h.current.onMove(state);
    }

    function onEnd(e: TouchEvent) {
      if (!taken) {
        reset();
        return;
      }
      const stale = e.timeStamp - last.t > STALE_VELOCITY_MS;
      finish(stale ? { ...state, velocity: 0 } : state);
    }

    function onCancel() {
      finish({ ...state, dx: 0, dy: 0, velocity: 0 });
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onCancel);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [ref, enabled]);

  return () => performance.now() - swipedAt.current < CLICK_GUARD_MS;
}

/** スワイプを始めてはいけない要素（文字の入力・選択や、自前で横に動く部品の上） */
export function isSwipeExempt(target: Element): boolean {
  return !!target.closest("input, textarea, select, [contenteditable], [data-no-swipe]");
}

/** 動きを減らす設定の端末か */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
