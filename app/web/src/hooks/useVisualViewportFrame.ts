"use client";

import { useEffect, type RefObject } from "react";

/** 枠の位置と高さを書く（null で CSS の値に戻す）。描き直しを起こさないよう DOM を直接書き換える */
function setBox(el: HTMLElement, box: { top: number; height: number } | null) {
  el.style.top = box ? `${box.top}px` : "";
  el.style.height = box ? `${box.height}px` : "";
}

/**
 * 全画面の枠（position: fixed; top: 0; height: 100dvh）を、見えている範囲（visualViewport）に合わせる。
 * キーボードが開くと枠がキーボードの上までに縮み、枠の一番下に置いた入力欄がキーボードのすぐ上に来る。
 *
 * ★枠ごと visualViewport に合わせる（入力欄だけを動かさない）★
 *   iOS は fixed の入力欄にフォーカスすると、キーボードの分だけ画面全体（visual viewport）を
 *   上へずらす。入力欄だけを translate で持ち上げても、写真やコメントの方が押し上げられて崩れる。
 *   枠の top と height を visualViewport に揃えれば、ずらされても枠は見えている範囲に収まり、
 *   中のスクロール位置もそのまま残る。
 * ★キーボードが閉じているときは style を消し、CSS の 100dvh に任せる★
 *   LINE・Safari の上下バーの出し入れには dvh が追従する。毎回 px で書くとそのたびに描き直しになる。
 * ★top / height だけを書く（transform に触らない）★ スワイプで戻る・開閉のアニメーションが枠の transform を使う。
 * Android（Chrome / LINE の WebView）はふつうキーボードで画面そのものが縮むので、ここでは何もしない。
 */
export function useVisualViewportFrame(frame: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = frame.current;
    if (!enabled || !vv || !el) return;
    const viewport = vv;
    const target = el;

    let raf = 0;
    function apply() {
      raf = 0;
      // キーボードで見えている範囲が縮んだときだけ合わせる。ピンチで拡大中は合わせない（拡大の邪魔になる）
      const shrunk = window.innerHeight - viewport.height > 1 || viewport.offsetTop > 1;
      setBox(target, shrunk && viewport.scale <= 1.01 ? { top: viewport.offsetTop, height: viewport.height } : null);
    }
    function schedule() {
      if (!raf) raf = requestAnimationFrame(apply);
    }

    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    apply();
    return () => {
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      if (raf) cancelAnimationFrame(raf);
      setBox(target, null);
    };
  }, [frame, enabled]);
}
