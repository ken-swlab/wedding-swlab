"use client";

import { useEffect, useRef } from "react";

/**
 * 要素が画面に入ったら onSeen を一度だけ呼ぶ。返した ref を対象の要素に付ける。
 * onSeen を渡さない（undefined）間は見張らない。
 * IntersectionObserver は対象の端末（iOS 12.2 以降の Safari・LINE）すべてにある。
 * rootMargin で、画面に入ったとみなす範囲を狭められる（例: 下から 20% は "0px 0px -20% 0px"）。
 */
export function useSeenOnce<T extends Element>(onSeen: (() => void) | undefined, threshold = 0.2, rootMargin = "0px") {
  const ref = useRef<T>(null);
  const callback = useRef(onSeen);
  useEffect(() => {
    callback.current = onSeen;
  }, [onSeen]);
  const enabled = onSeen !== undefined;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          callback.current?.();
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, threshold, rootMargin]);

  return ref;
}
