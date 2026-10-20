"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 要素が画面に入っているかを返す（入るたび・出るたびに変わる）。返した ref を対象の要素に付ける。
 * 一度だけでよいときは useSeenOnce を使う。threshold 0 は「少しでも入ったら」。
 * ★display: none（hidden）の要素は、画面に入っていない扱いになる★（IntersectionObserver の仕様）
 */
export function useInView<T extends Element>(threshold = 0) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setInView(last.isIntersecting);
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return [ref, inView] as const;
}
