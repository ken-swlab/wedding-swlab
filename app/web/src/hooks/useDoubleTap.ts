"use client";

import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { DOUBLE_TAP_MS, DOUBLE_TAP_SLOP_PX } from "@/config/guestbook";

/** タップした位置（画面の座標） */
export type TapPoint = { clientX: number; clientY: number };

/**
 * 1回タップとダブルタップを見分ける（Issue #96）。onClick の中で tap() を呼ぶ。
 *
 * - 前のタップから DOUBLE_TAP_MS 以内・DOUBLE_TAP_SLOP_PX 以内なら、ダブルタップとして onDouble をすぐ呼ぶ。
 * - そうでなければ1回目として覚え、onSingle があれば DOUBLE_TAP_MS 待ってから呼ぶ（2回目が来たら呼ばない）。
 * - ダブルタップのあとも続けてタップすると、そのたびに onDouble を呼ぶ（1回タップには戻さない）。
 *
 * ★click の時刻と位置だけで判定する★ dblclick やタッチイベントは使わない。
 *   iOS の LINE アプリ内ブラウザは dblclick を出さないことがあり、click ならマウスでも同じ判定で動く。
 * ★画面から消えるときは、待っている1回タップを捨てる★
 *   捨てないと、画面が切り替わったあとでビューアが勝手に開く。
 */
export function useDoubleTap() {
  const last = useRef<{ at: number; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 覚えている1回目と、待っている1回タップを捨てる（スワイプなど、タップではない操作のあとに呼ぶ） */
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    last.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const tap = useCallback((e: MouseEvent, onDouble: (point: TapPoint) => void, onSingle?: () => void) => {
    const now = performance.now();
    const prev = last.current;
    last.current = { at: now, x: e.clientX, y: e.clientY };
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;

    if (
      prev &&
      now - prev.at <= DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= DOUBLE_TAP_SLOP_PX
    ) {
      onDouble({ clientX: e.clientX, clientY: e.clientY });
      return;
    }
    if (!onSingle) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      onSingle();
    }, DOUBLE_TAP_MS);
  }, []);

  return { tap, cancel };
}
