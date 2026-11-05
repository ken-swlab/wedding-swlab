"use client";

import { useEffect, useRef } from "react";

/**
 * 目印の要素が画面に入ったら（rootMargin のぶん手前で）onHit を呼ぶ（Issue #251 の先読み）。
 * ★読み込みが終わるたびに見張りを作り直す★（busy が変わるたびに effect が走る）
 *   1回の読み込みで目印が画面の外へ押し出されないことがある。目印が見えたままだと
 *   IntersectionObserver は再び知らせてこないが、作り直せば最初に1回知らせる。
 */
export function useNearEnd<T extends Element>(enabled: boolean, busy: boolean, onHit: () => void, rootMargin = "0px") {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || busy || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onHit();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, busy, onHit, rootMargin]);
  return ref;
}
