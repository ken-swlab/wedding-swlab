"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useGuestbookData } from "./GuestbookDataProvider";
import {
  CHROME_MORPH_EASING,
  PULL_HOLD_PX,
  PULL_MAX_PX,
  PULL_MIN_SPIN_MS,
  PULL_RESISTANCE,
  PULL_SETTLE_MS,
  PULL_SPINNER_PX,
  PULL_TRIGGER_PX,
} from "@/config/guestbook";

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
 * idle: 何もしていない / pulling: 指で引っ張っている / refreshing: 更新中（定位置で回る）
 * settling: 離した・更新が終わったあと、タイムラインが戻ってスピナーが消えるまで
 */
type Phase = "idle" | "pulling" | "refreshing" | "settling";

/** 指の移動 1px あたりにスピナーを回す角度（ゼンマイを巻く手ざわり） */
const WIND_DEG_PER_PX = 5;
/** スピナーの円弧（viewBox 24 の中の半径 10） */
const ARC_RADIUS = 10;
const ARC_LENGTH = 2 * Math.PI * ARC_RADIUS;
/** main の上余白（pt-4）。スピナーはヘッダーと本文のすき間の真ん中に置く */
const CONTENT_TOP_PAD_PX = 16;
/** 消えるときの縮小・フェードの時間 (ms) */
const SPINNER_FADE_MS = 200;
/** 発火する距離を越えた瞬間に少し弾ませる曲線（行き過ぎて戻る） */
const READY_POP_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/**
 * 引っ張って更新と、LINE 内ブラウザが下スワイプで閉じるのを防ぐ処理。
 * 文字は出さず、指の動きに合わせて丸いスピナーが降りてきて回る（X のような操作感）。
 * 本文（children）も指に合わせて下げ、終わったら spring で戻す。
 *
 * ★ページ先頭での下向きの touchmove は preventDefault する★
 *   LINE の iOS 版はアプリ内ブラウザがシートとして開き、先頭でさらに下へ引くと
 *   シートごと閉じてしまう。overscroll-behavior だけでは止まらない端末があるため、
 *   タッチイベントでも止める。そのため touchmove は passive: false で登録する。
 * ★表示は transform と opacity だけで動かす★ レイアウトを動かすと LINE 内ブラウザでカクつく。
 * ★本文の transform は引っ張っている間だけ付け、idle では style ごと外す★
 *   transform を持つ要素は中の position: fixed の基準と重なりの単位（stacking context）になる。
 *   付けっぱなしにすると、本文の中で開く詳細シートやライトボックスが画面に固定されず、
 *   ヘッダーやボトムナビ（z-40）の下に潜る。付いている間は本文のタップも止めて、開かせない。
 * ★曲線は transitionTimingFunction に単独で渡す★
 *   linear() を解釈できない古い Safari ではその指定だけが捨てられ、既定の ease で動く。
 *   transition の一括指定に混ぜると、動き自体が付かなくなる。
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const { refresh } = useGuestbookData();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pull, setPull] = useState(0);
  const [angle, setAngle] = useState(0);

  // refresh が作り直されても、タッチの登録と進行中の更新は続ける
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "none";

    let startY: number | null = null;
    let distance = 0;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function settle() {
      setPhase("settling");
      timer = setTimeout(() => {
        busy = false;
        setPhase("idle");
        setPull(0);
        setAngle(0);
      }, PULL_SETTLE_MS);
    }

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
        setPhase("idle");
        setPull(0);
        setAngle(0);
        return;
      }
      if (e.cancelable) e.preventDefault();
      distance = Math.min(dy * PULL_RESISTANCE, PULL_MAX_PX);
      setPhase("pulling");
      setPull(distance);
      setAngle(distance * WIND_DEG_PER_PX);
    }

    function onEnd() {
      if (startY === null) return;
      startY = null;
      if (distance <= 0) return;
      busy = true;
      if (distance < PULL_TRIGGER_PX) {
        settle();
        return;
      }
      setPhase("refreshing");
      setPull(PULL_HOLD_PX);
      // 更新が一瞬で終わっても（間隔内の更新は何もせず終わる）、少しは回して見せる
      const minSpin = new Promise((resolve) => setTimeout(resolve, PULL_MIN_SPIN_MS));
      void Promise.allSettled([refreshRef.current(), minSpin]).then(settle);
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      clearTimeout(timer);
      root.style.overscrollBehaviorY = prev;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const progress = Math.min(1, pull / PULL_TRIGGER_PX);
  const ready = phase === "refreshing" || (phase === "pulling" && pull >= PULL_TRIGGER_PX);
  const spinning = phase === "refreshing" || phase === "settling";
  const offset = phase === "pulling" || phase === "refreshing" ? pull : 0;

  // 指を離したあとは spring で動く。引っ張っている間は指に直結させる（遅れると重く感じる）
  const content: CSSProperties | undefined =
    phase === "idle"
      ? undefined
      : {
          transform: `translate3d(0, ${offset}px, 0)`,
          transitionProperty: "transform",
          transitionDuration: phase === "pulling" ? "0ms" : `${PULL_SETTLE_MS}ms`,
          transitionTimingFunction: CHROME_MORPH_EASING,
        };

  const spinnerY = (pull + CONTENT_TOP_PAD_PX - PULL_SPINNER_PX) / 2;
  const spinner: CSSProperties = {
    transform: `translate3d(0, ${spinnerY}px, 0) rotate(${angle}deg) scale(${phase === "settling" ? 0.4 : 1})`,
    opacity: phase === "pulling" ? progress : phase === "refreshing" ? 1 : 0,
    transitionProperty: "transform, opacity",
    transitionDuration:
      phase === "pulling" || phase === "idle"
        ? "0ms"
        : phase === "refreshing"
          ? `${PULL_SETTLE_MS}ms`
          : `${SPINNER_FADE_MS}ms`,
    transitionTimingFunction: phase === "refreshing" ? CHROME_MORPH_EASING : "ease-out",
  };

  // 円弧は引っ張るほど伸びる。発火する距離を越えたら濃くなって少し弾む（引っかかりの手ざわり）
  const arc = ARC_LENGTH * (spinning ? 0.75 : 0.1 + 0.65 * progress);

  return (
    <>
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-30 flex justify-center"
      >
        <span className="sr-only">{phase === "refreshing" ? "更新しています" : ""}</span>
        <span aria-hidden className="block" style={spinner}>
          <span
            className={`block ${ready ? "text-stone-700" : "text-stone-400"}`}
            style={{
              transform: `scale(${ready ? 1 : 0.85})`,
              transition: `transform 180ms ${READY_POP_EASING}, color 180ms`,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={PULL_SPINNER_PX}
              height={PULL_SPINNER_PX}
              className={`block ${spinning ? "animate-spin" : ""}`}
            >
              <circle
                cx="12"
                cy="12"
                r={ARC_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={`${arc} ${ARC_LENGTH}`}
                transform="rotate(-90 12 12)"
              />
            </svg>
          </span>
        </span>
      </div>
      <div className={phase === "idle" ? undefined : "pointer-events-none"} style={content}>
        {children}
      </div>
    </>
  );
}
