"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CHROME_COMPACT_AFTER_PX,
  CHROME_EXPAND_AFTER_PX,
  CHROME_TOP_ZONE_PX,
} from "@/config/guestbook";

/** 文字を入力している最中か（iOS はキーボードを出すときにページを動かす） */
function typing(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/**
 * 下へ読み進めている間だけ true を返す（ヘッダーとボトムナビを退避させる合図）。
 * 少しでも上へ戻したら、すぐ false に戻す。
 *
 * ★画面の高さが変わったスクロールは向きの判定に使わない★
 *   LINE 内ブラウザ・Safari は上下のバーを出し入れするときに innerHeight が変わり、
 *   それに合わせて scrollY も数 px 動く。これを「上へ戻した」と読むと、
 *   バーが隠れる → ナビが戻る → … とガタつく。高さが変わったら基準を取り直すだけにする。
 * ★scrollY は 0〜最大値に収めてから比べる★
 *   iOS の端でのバウンド（行き過ぎて戻る）を「上へ戻した」と読まないため。
 * ★モーダル表示中（body が overflow: hidden）と文字入力中は状態を変えない★
 *   どちらもユーザーの「読み進める」操作ではないスクロールが起きる。
 */
export function useCompactChrome(resetKey: string) {
  // 画面（resetKey）が変わったら通常表示から始める。effect で setState せず、キーで切り分ける
  const [state, setState] = useState({ key: resetKey, compact: false });
  const compact = state.key === resetKey && state.compact;

  useEffect(() => {
    const setCompact = (value: boolean) =>
      setState((s) => (s.key === resetKey && s.compact === value ? s : { key: resetKey, compact: value }));

    let lastY = clampedScrollY();
    let lastHeight = window.innerHeight;
    let down = 0;
    let frame = 0;

    function clampedScrollY(): number {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.min(Math.max(window.scrollY, 0), Math.max(max, 0));
    }

    function update() {
      frame = 0;
      const y = clampedScrollY();
      const height = window.innerHeight;
      const dy = y - lastY;
      const resized = height !== lastHeight;
      lastY = y;
      lastHeight = height;

      if (y <= CHROME_TOP_ZONE_PX) {
        down = 0;
        setCompact(false);
        return;
      }
      if (resized || document.body.style.overflow === "hidden" || typing()) {
        down = 0;
        return;
      }
      if (dy > 0) {
        down += dy;
        if (down >= CHROME_COMPACT_AFTER_PX) setCompact(true);
      } else if (dy <= -CHROME_EXPAND_AFTER_PX) {
        down = 0;
        setCompact(false);
      }
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [resetKey]);

  const expand = useCallback(() => setState({ key: resetKey, compact: false }), [resetKey]);
  return { compact, expand };
}
