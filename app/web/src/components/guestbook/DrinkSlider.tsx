"use client";

import { useId, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { DRINK_LEVELS, DRINK_LEVEL_MAX, type DrinkLevel } from "@/config/drink";

/** グラスの中身の量（0〜1。1 を超えるとあふれる）。値ごと: 空 → 少し → 半分 → 多め → あふれる */
const FILL = [0, 0.2, 0.5, 0.78, 1] as const;

/** グラスの内側（SVG の座標）。中身はこの範囲を下から満たす */
const GLASS_TOP = 14;
const GLASS_BOTTOM = 70;
/** 空のときの中身の上端（グラスの底 76 より下） */
const GLASS_EMPTY = 80;

/**
 * 「お酒はどれくらい飲みますか？」の5段階スライダー（Issue #147）。回答フォームの中で唯一遊べる項目。
 *
 * ★初期状態は未選択（つまみを出さない）★ 一度触るまで value は null で、フォームは送信できない
 *   （answerDraftReady）。思い込みで真ん中のまま送られないようにする。
 * ★<input type="range"> ではなく role="slider" で作る★ iOS Safari の range は、つまみを掴まないと動かず
 *   （トラックを押しても移らない）、つまみを出さない未選択の状態では操作できない。
 *   読み上げは aria-valuenow / aria-valuetext、キーボードは矢印・Home・End で動かす。
 * ★touch-action: pan-y★ 縦のスクロールはブラウザに任せ、横のドラッグだけをスライダーが受ける
 *   （LINE アプリ内ブラウザで画面のスクロールと干渉させない）。
 * ★動きは 0.3 秒で控えめに★ prefers-reduced-motion では出さない（motion-reduce:）。
 */
export function DrinkSlider({ value, onChange }: { value: DrinkLevel | null; onChange: (v: DrinkLevel) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const labelId = useId();
  const max = DRINK_LEVEL_MAX;

  function levelAt(clientX: number): DrinkLevel {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value ?? 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * max) as DrinkLevel;
  }

  function set(v: number) {
    const next = Math.min(max, Math.max(0, v)) as DrinkLevel;
    if (next !== value) onChange(next);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    set(levelAt(e.clientX));
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragging.current) set(levelAt(e.clientX));
  }
  function onPointerEnd() {
    dragging.current = false;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const base = value ?? Math.floor(max / 2);
    const keys: Record<string, number> = {
      ArrowLeft: base - 1,
      ArrowDown: base - 1,
      ArrowRight: base + 1,
      ArrowUp: base + 1,
      Home: 0,
      End: max,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    // 未選択のときは、最初の1回で真ん中を選ぶ（いきなり端に飛ばさない）
    set(value === null && e.key !== "Home" && e.key !== "End" ? base : keys[e.key]);
  }

  const selected = value === null ? null : DRINK_LEVELS[value];
  const pct = value === null ? 50 : (value / max) * 100;
  const fill = value === null ? 0 : FILL[value];
  // 空のときはグラスの底より下まで下げて、中身を見せない
  const liquidTop = fill === 0 ? GLASS_EMPTY : GLASS_BOTTOM - (GLASS_BOTTOM - GLASS_TOP) * Math.min(fill, 1);
  const overflowing = value === max;

  return (
    <div>
      <div className="flex items-end gap-4">
        <Glass liquidTop={liquidTop} fill={fill} overflowing={overflowing} />
        <div className="min-h-14 flex-1">
          <p id={labelId} className="text-[13px] text-stone-500">
            {selected ? (
              <span className="text-base font-medium text-stone-800">{selected.formLabel || "🍺".repeat(value ?? 0)}</span>
            ) : (
              "バーを動かして選んでください"
            )}
          </p>
          {overflowing && (
            <div className="mt-1 flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block -rotate-12 rounded-md border-2 border-accent-600 px-2 py-0.5 font-serif text-sm font-bold tracking-widest text-accent-600 drink-stamp"
              >
                酒豪認定
              </span>
              <span className="text-[11px] text-stone-400">酒豪タグが付きます</span>
            </div>
          )}
        </div>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="お酒をどれくらい飲むか"
        aria-describedby={labelId}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={selected ? selected.formLabel || `${value}（5段階）` : "未選択"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        style={{ touchAction: "pan-y" }}
        className="relative mx-[22px] mt-4 h-11 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-4 rounded-full"
      >
        {/* トラック */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-stone-200" />
        <div
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-amber-400 transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: value === null ? 0 : `${pct}%` }}
        />
        {/* メモリ */}
        {DRINK_LEVELS.map((l) => (
          <span
            key={l.value}
            aria-hidden
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
              value !== null && l.value <= value ? "border-amber-400 bg-amber-400" : "border-stone-300 bg-white"
            }`}
            style={{ left: `${(l.value / max) * 100}%` }}
          />
        ))}
        {/* つまみ（未選択のときは出さない） */}
        {value !== null && (
          <span
            aria-hidden
            className="absolute top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border border-stone-200 bg-white shadow-md transition-[left] duration-300 motion-reduce:transition-none"
            style={{ left: `${pct}%` }}
          />
        )}
      </div>

      {/* メモリのラベル。押してもその値に移る（読み上げはスライダー本体で行うので、ここは隠す） */}
      <div aria-hidden className="relative mx-[22px] mt-1 h-11">
        {DRINK_LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            tabIndex={-1}
            onClick={() => set(l.value)}
            className={`absolute top-0 flex h-11 min-w-11 -translate-x-1/2 touch-manipulation items-start justify-center whitespace-nowrap px-1 text-[11px] ${
              value === l.value ? "font-medium text-stone-800" : "text-stone-400"
            }`}
            style={{ left: `${(l.value / max) * 100}%` }}
          >
            {l.formLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

/** グラスの絵。中身の上端（liquidTop）を変えて量を表す。あふれるときは縁から泡がこぼれる */
function Glass({ liquidTop, fill, overflowing }: { liquidTop: number; fill: number; overflowing: boolean }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 56 80" className="h-20 w-14 shrink-0" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <path d="M8 12 L48 12 L43 72 Q42.5 76 38 76 L18 76 Q13.5 76 13 72 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {/* ★y 属性ではなく transform で動かす★ SVG の y を CSS で遷移させるのは Safari が対応していない */}
        <g style={{ transform: `translateY(${liquidTop}px)` }} className="transition-transform duration-300 motion-reduce:transition-none">
          <rect x="0" y="0" width="56" height="80" className="fill-amber-300" />
          {/* 泡の層 */}
          <rect x="0" y="-2" width="56" height="5" className={`fill-amber-50 ${fill === 0 ? "opacity-0" : "opacity-100"}`} />
        </g>
      </g>
      {/* あふれた泡 */}
      <g className={`transition-opacity duration-300 motion-reduce:transition-none ${overflowing ? "opacity-100" : "opacity-0"}`}>
        <ellipse cx="28" cy="11" rx="22" ry="5" className="fill-amber-50 stroke-amber-200" strokeWidth="1" />
        <circle cx="12" cy="9" r="4" className="fill-amber-50 stroke-amber-200" strokeWidth="1" />
        <circle cx="44" cy="8" r="4.5" className="fill-amber-50 stroke-amber-200" strokeWidth="1" />
        <path d="M49 13 Q51 20 49 26 Q47 20 49 13 Z" className="fill-amber-200" />
      </g>
      <path
        d="M8 12 L48 12 L43 72 Q42.5 76 38 76 L18 76 Q13.5 76 13 72 Z"
        className="fill-none stroke-stone-400"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
