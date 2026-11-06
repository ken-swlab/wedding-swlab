"use client";

import { useEffect, useRef } from "react";
import { RESUME_SCROLL_WAIT_MS } from "@/config/guestbook";

/**
 * 開き直して最後に見ていた画面へ戻ったとき、スクロール位置も戻す（Issue #273。lib/resume.ts）。
 * ★投稿が読み込まれて高さが足りるまで、RESUME_SCROLL_WAIT_MS のあいだ戻そうとし続ける★
 *   端末に残した前回の内容（Issue #251）からすぐ出るが、タイムラインは最初 10 件だけなので、それより下は届く所まで。
 * ★ゲストが自分で触ったら、やめる★（指・ホイール・キー）
 * ★1回だけ★ 同じ画面にあとで戻ってきても、もう戻さない。
 */
export function useResumeScroll(pathname: string, target: { path: string; y: number } | null) {
  const used = useRef(false);
  useEffect(() => {
    if (used.current || !target || target.path !== pathname) return;
    used.current = true;
    const y = target.y;
    if (y <= 0) return;
    let raf = 0;
    let stopped = false;
    const until = performance.now() + RESUME_SCROLL_WAIT_MS;
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
    const tick = () => {
      if (stopped) return;
      window.scrollTo(0, y);
      if (Math.abs(window.scrollY - y) < 2 || performance.now() > until) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const opts = { passive: true, once: true } as const;
    window.addEventListener("touchstart", stop, opts);
    window.addEventListener("wheel", stop, opts);
    window.addEventListener("keydown", stop, opts);
    return () => {
      stop();
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [pathname, target]);
}
