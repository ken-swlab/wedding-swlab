"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/hooks/useSwipe";
import type { TapPoint } from "@/hooks/useDoubleTap";
import { HEART_BURST_MS, HEART_BURST_SIZE_PX, LIKE_ERROR_MS } from "@/config/guestbook";

type Burst = { id: number; x: number; y: number; tilt: number };

/**
 * ダブルタップでいいねしたときのハートの演出（Issue #96）。
 * 返した layer を、position が付いた箱（写真のマス・ビューア）の中に置き、show() にタップの位置を渡す。
 *
 * ★ハートは書き込みを待たずに出す★ いいねの書き込みに失敗したら fail() で短い知らせを出す。
 * ★タップのたびに1つ出す★（いいねの書き込みを1回にするのは呼び出し側）
 */
export function useHeartBursts() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [failed, setFailed] = useState(0);
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  /** タップした位置（画面の座標）にハートを出す */
  const show = useCallback((point: TapPoint) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const id = ++seq.current;
    // 軽く傾ける（左右どちらかへ最大 12 度）
    const tilt = Math.round((Math.random() - 0.5) * 24);
    setBursts((list) => [...list, { id, x: point.clientX - rect.left, y: point.clientY - rect.top, tilt }]);
  }, []);

  /** いいねの書き込みに失敗したことを、少しの間だけ知らせる */
  const fail = useCallback(() => {
    const id = ++seq.current;
    setFailed(id);
    setTimeout(() => setFailed((cur) => (cur === id ? 0 : cur)), LIKE_ERROR_MS);
  }, []);

  const done = useCallback((id: number) => setBursts((list) => list.filter((b) => b.id !== id)), []);

  const layer = (
    // ★タップを邪魔しない（pointer-events-none）。長押しのメニューや選択も出さない★
    <div ref={box} aria-hidden={failed === 0} className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden">
      {bursts.map((b) => (
        <Heart key={b.id} burst={b} onDone={done} />
      ))}
      {failed !== 0 && (
        <p
          role="alert"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/70 px-4 py-2 text-xs font-medium text-white"
        >
          いいねできませんでした
        </p>
      )}
    </div>
  );

  return { layer, show, fail };
}

/**
 * ハート1つ。小さく出て少し大きくなり（弾む）、薄くなって消える。終わったら自分を一覧から外す。
 *
 * ★動かすのは transform と opacity だけ★ レイアウトを動かすと LINE のアプリ内ブラウザでカクつく
 *   （GuestbookShell の CHROME_MOTION の★と同じ理由）。
 * ★「視差効果を減らす」がオンのときは弾ませない★ その場で薄く出て消えるだけにする。
 * ★描く前にアニメーションを始める（layout effect）★ 始まる前の姿（不透明・等倍）が一瞬見えるのを防ぐ。
 */
function Heart({ burst, onDone }: { burst: Burst; onDone: (id: number) => void }) {
  const el = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const place = `translate(-50%, -50%) rotate(${burst.tilt}deg)`;
    const frames: Keyframe[] = prefersReducedMotion()
      ? [
          { opacity: 0, transform: place },
          { opacity: 0.9, transform: place, offset: 0.2 },
          { opacity: 0.9, transform: place, offset: 0.7 },
          { opacity: 0, transform: place },
        ]
      : [
          { opacity: 0, transform: `${place} scale(0.3)` },
          { opacity: 1, transform: `${place} scale(1.2)`, offset: 0.2 },
          { opacity: 1, transform: `${place} scale(0.95)`, offset: 0.32 },
          { opacity: 1, transform: `${place} scale(1)`, offset: 0.45 },
          { opacity: 1, transform: `${place} scale(1)`, offset: 0.7 },
          { opacity: 0, transform: `${place} translateY(-12px) scale(1.1)` },
        ];
    const anim = node.animate(frames, { duration: HEART_BURST_MS, easing: "ease-out", fill: "forwards" });
    anim.onfinish = () => onDone(burst.id);
    return () => anim.cancel();
  }, [burst.id, burst.tilt, onDone]);

  return (
    <span
      ref={el}
      className="absolute block opacity-0 will-change-transform"
      style={{ left: burst.x, top: burst.y, width: HEART_BURST_SIZE_PX, height: HEART_BURST_SIZE_PX }}
    >
      <svg viewBox="0 0 24 24" className="h-full w-full fill-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    </span>
  );
}
