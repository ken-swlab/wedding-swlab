"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * 箱の中で、いま画面に見えている項目のうち一番後ろのものの番号（Issue #255 の先読み）。見えていなければ -1。
 * 項目は attr の属性に「ids の中の値」を持つ要素（タイムラインは data-post-card・ギャラリーは data-gallery-tile）。
 * ★番号は ids の並びで数える★ 一覧が増減しても（続きの読み込み・送信中の投稿）、ids を渡し直せば数え直す。
 */
export function useLastVisible(container: RefObject<HTMLElement | null>, attr: string, ids: readonly string[]): number {
  const [last, setLast] = useState(-1);
  const visible = useRef(new Set<string>());
  const key = ids.join("|");

  useEffect(() => {
    const root = container.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const index = new Map(ids.map((id, i) => [id, i]));
    visible.current = new Set();
    const recompute = () => {
      let max = -1;
      for (const id of visible.current) max = Math.max(max, index.get(id) ?? -1);
      setLast(max);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).getAttribute(attr);
        if (!id) continue;
        if (e.isIntersecting) visible.current.add(id);
        else visible.current.delete(id);
      }
      recompute();
    });
    root.querySelectorAll(`[${attr}]`).forEach((el) => io.observe(el));
    return () => io.disconnect();
    // ids は key（中身）で見る。毎回新しい配列でも、中身が同じなら見張り直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, attr, key]);

  return last;
}
