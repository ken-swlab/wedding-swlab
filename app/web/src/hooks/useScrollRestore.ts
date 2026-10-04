"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { POP_RESTORE_WINDOW_MS, SCROLL_STORAGE_PREFIX } from "@/config/guestbook";

// 戻る・進む（popstate）の時刻。Next.js より先に受け取れるよう、読み込み時に1回だけ登録する
let lastPopAt = -Infinity;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastPopAt = performance.now();
  });
}

function read(key: string): number | null {
  try {
    const v = Number(sessionStorage.getItem(SCROLL_STORAGE_PREFIX + key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function write(key: string, y: number) {
  try {
    sessionStorage.setItem(SCROLL_STORAGE_PREFIX + key, String(Math.round(y)));
  } catch {
    /* プライベートモードなどで書けなくても続行する */
  }
}

/**
 * 戻る操作で画面に帰ってきたとき、離れたときのスクロール位置に戻す。
 *
 * ★戻る・進むのときだけ復元する★
 *   タブやリンクで開いたときまで復元すると、「タイムライン」を押したのに
 *   途中から始まって見える。
 * ★位置はスクロールのたびに ref に控え、離れるときに保存する★
 *   離れる瞬間に window.scrollY を読むと、遷移先の画面の位置（先頭）を拾うことがある。
 * ★描画と同じタイミング（layout effect）で戻す★ 中身はすでに Context にあり、
 *   この時点でページの高さが確定しているため、先頭が一瞬見えることもない。
 */
export function useScrollRestore(key: string) {
  const y = useRef(0);

  useLayoutEffect(() => {
    if (performance.now() - lastPopAt > POP_RESTORE_WINDOW_MS) return;
    const saved = read(key);
    if (saved !== null) window.scrollTo(0, saved);
  }, [key]);

  useEffect(() => {
    y.current = window.scrollY;
    const onScroll = () => {
      y.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      write(key, y.current);
    };
  }, [key]);
}
