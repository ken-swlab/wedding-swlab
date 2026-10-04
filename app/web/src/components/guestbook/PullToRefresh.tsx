"use client";

import { useEffect, useState } from "react";
import { useGuestbookData } from "./GuestbookDataProvider";
import { PULL_MAX_PX, PULL_RESISTANCE, PULL_TRIGGER_PX } from "@/config/guestbook";

/** 引っ張り始めてはいけない場所か（モーダル表示中・途中までスクロールした箱の中） */
function blocked(target: EventTarget | null): boolean {
  // ライトボックスなどは body のスクロールを止めている。その上での下スワイプは中身の操作
  if (document.body.style.overflow === "hidden") return true;
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
}

/**
 * 引っ張って更新と、LINE 内ブラウザが下スワイプで閉じるのを防ぐ処理。
 *
 * ★ページ先頭での下向きの touchmove は preventDefault する★
 *   LINE の iOS 版はアプリ内ブラウザがシートとして開き、先頭でさらに下へ引くと
 *   シートごと閉じてしまう。overscroll-behavior だけでは止まらない端末があるため、
 *   タッチイベントでも止める。そのため touchmove は passive: false で登録する。
 * ★表示は transform だけで動かす★ レイアウトを動かすと LINE 内ブラウザでカクつく。
 */
export function PullToRefresh() {
  const { refresh } = useGuestbookData();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "none";

    let startY: number | null = null;
    let distance = 0;
    let busy = false;

    function onStart(e: TouchEvent) {
      if (busy || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) {
        startY = null;
        return;
      }
      startY = e.touches[0].clientY;
      distance = 0;
    }

    function onMove(e: TouchEvent) {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        // 上へ戻した・スクロールが始まったら、ふつうのスクロールに任せる
        startY = null;
        distance = 0;
        setPull(0);
        return;
      }
      if (e.cancelable) e.preventDefault();
      distance = Math.min(dy * PULL_RESISTANCE, PULL_MAX_PX);
      setPull(distance);
    }

    function onEnd() {
      if (startY === null) return;
      startY = null;
      if (distance < PULL_TRIGGER_PX) {
        setPull(0);
        return;
      }
      busy = true;
      setRefreshing(true);
      setPull(PULL_TRIGGER_PX);
      void refresh().finally(() => {
        busy = false;
        setRefreshing(false);
        setPull(0);
      });
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      root.style.overscrollBehaviorY = prev;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [refresh]);

  const ready = pull >= PULL_TRIGGER_PX;
  return (
    <div
      aria-hidden={!refreshing}
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-30 flex justify-center"
      style={{
        transform: `translateY(${pull - 44}px)`,
        opacity: pull > 0 || refreshing ? 1 : 0,
        transition: pull === 0 || refreshing ? "transform 0.2s, opacity 0.2s" : "none",
      }}
    >
      <span className="flex h-9 items-center gap-2 rounded-full border border-stone-200/80 bg-white px-3.5 text-xs text-stone-500 shadow-sm">
        <span
          aria-hidden
          className={`inline-block h-3.5 w-3.5 rounded-full border-2 border-stone-300 border-t-stone-700 ${
            refreshing ? "animate-spin" : ""
          }`}
          style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)` }}
        />
        {refreshing ? "更新しています…" : ready ? "離すと更新します" : "引っ張って更新"}
      </span>
    </div>
  );
}
