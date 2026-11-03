"use client";

import { useId, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { DRINK_LEVELS, DRINK_LEVEL_MAX, type DrinkLevel } from "@/config/drink";
import { MugIcon } from "@/components/icons";

/**
 * ジョッキの液面の y（Issue #234。SVG の座標で、内側は 22〜86）。値ごと: 空 → 少し → 半分 → 多め → 縁まで（あふれる）。
 * 0 は空（ジョッキの下に隠す）。
 */
const LIQUID_TOP = [100, 70, 54, 38, 24] as const;
/** 泡の層の厚さ。4 は縁から溢れる泡（beer-over）を別に出す */
const HEAD_H = [0, 4, 6, 9, 6] as const;

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
  const overflowing = value === max;

  return (
    <div>
      <div className="flex items-end gap-4">
        <BeerMug level={value ?? 0} />
        <div className="min-h-14 flex-1">
          <p id={labelId} className="text-[13px] text-stone-500">
            {selected ? (
              <span className="inline-flex items-center gap-0.5 text-base font-medium text-stone-800">
                {/* 名前の無い段階はジョッキの数で見せる（絵文字は使わない。Issue #227） */}
                {selected.formLabel || Array.from({ length: value ?? 0 }, (_, i) => <MugIcon key={i} className="h-5 w-5" />)}
              </span>
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

/** 泡の層の波の高さ（丸を並べず、なだらかで不揃いな波にする。Issue #234） */
const AMP = [1.1, 1.8, 0.9, 1.5, 1.2, 2.0, 1.0, 1.6, 1.3, 1.7];

/** 泡の層の形。液面（y=0）の上に厚さ h の波を作る */
function headPath(h: number): string {
  let d = `M0 1 L0 ${-h}`;
  const W = 80;
  const step = 8;
  for (let i = 0, x = 0; x < W; i++, x += step) {
    d += ` Q${x + step / 2} ${-h - AMP[i % AMP.length] * (h > 5 ? 1.2 : 0.9)} ${x + step} ${-h + (i % 2 ? 0.3 : -0.2)}`;
  }
  return `${d} L${W} 1 Z`;
}

/** 泡のきめ: [x, 厚さに対する高さの割合] */
const HEAD_DOTS: readonly (readonly [number, number])[] = [[18, 0.45], [25, 0.7], [31, 0.35], [37, 0.6], [43, 0.4], [48, 0.65], [22, 0.25], [40, 0.8]];

/** 立ちのぼる気泡: [cx, cy, r, 遅れ(s)] */
const BUBBLES: readonly (readonly [number, number, number, number])[] = [
  [22, 62, 1.3, 0], [30, 66, 1, 0.6], [38, 60, 1.5, 1.2], [45, 64, 1, 1.8], [26, 68, 0.9, 0.9], [42, 68, 1.2, 1.5],
];

/** 溢れる泡の輪郭（塗りは閉じ、線は外側だけ） */
const OVER_EDGE = "M12 27 C8 27 5 24 6 19 C3 14 7 8 13 8 C15 2 22 -1 28 1 Q34 -5 41 -1 Q48 -3 52 3 C58 3 62 9 60 15 C63 20 59 26 54 27";
/** 取っ手 */
const HANDLE = "M53 34 H62 Q70 34 70 42 V62 Q70 70 62 70 H53";

/**
 * 泡が溢れるビールのジョッキ（Issue #234。以前の細いグラスはビール感が弱かった）。level は 0〜4。
 *
 * ★液と泡の層は transform（translateY）で動かす★ SVG の y を CSS で遷移させるのは Safari が対応していない。
 * ★defs の ID は useId() で作る★ 1画面に2つ出ても、グラデーションと切り抜きが別の絵の ID を拾わない。
 * ★泡は丸を並べない★ 丸の連結は不自然だった。なだらかな波（headPath）と、立体的な塗り（左上が明るい放射グラデーション）。
 * 4（大量）では、泡が縁から盛り上がって溢れ、2筋垂れる（beer-over）。垂れる泡には輪郭の線を引かない。
 * 動きは globals.css の beer-*（動きを減らす設定では止め、溢れた状態の静止した絵にする）。
 */
function BeerMug({ level }: { level: number }) {
  // useId() には「:」や「«»」が入ることがある。url(#…) で参照するので、英数字・-・_ だけにする
  const base = `beer${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const id = { inner: `${base}-inner`, amber: `${base}-amber`, foam: `${base}-foam`, foamDrip: `${base}-drip`, shine: `${base}-shine` };
  const lv = Math.min(4, Math.max(0, level));
  const top = LIQUID_TOP[lv];
  const h = HEAD_H[lv];
  const layer: CSSProperties = { transform: `translateY(${top}px)` };

  return (
    <svg viewBox="0 0 80 96" aria-hidden className="shrink-0" style={{ width: 84, height: 100, overflow: "visible" }}>
      <defs>
        <clipPath id={id.inner}>
          <path d="M14 22 H52 V82 Q52 86 48 86 H18 Q14 86 14 82 Z" />
        </clipPath>
        <linearGradient id={id.amber} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f9c843" />
          <stop offset="1" stopColor="#e59a12" />
        </linearGradient>
        <radialGradient id={id.foam} cx=".38" cy=".3" r=".85">
          <stop offset="0" stopColor="#fffefa" />
          <stop offset=".55" stopColor="#fcf3de" />
          <stop offset="1" stopColor="#f0dcae" />
        </radialGradient>
        <linearGradient id={id.foamDrip} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fdf6e6" />
          <stop offset="1" stopColor="#f3e3bd" />
        </linearGradient>
        <linearGradient id={id.shine} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 取っ手 */}
      <path d={HANDLE} fill="none" stroke="#c4bdb5" strokeWidth="4" strokeLinejoin="round" />
      <path d={HANDLE} fill="none" stroke="#f7f6f4" strokeWidth="1.6" />

      <g clipPath={`url(#${id.inner})`}>
        <rect x="0" y="0" width="80" height="96" fill="#eef1f3" />
        {/* 液（液面の y = LIQUID_TOP） */}
        <g className="beer-liquid" style={layer}>
          <rect x="0" y="0" width="80" height="100" fill={`url(#${id.amber})`} />
          {/* 気泡（0 では出さない） */}
          {lv > 0 &&
            BUBBLES.map(([cx, cy, r, delay]) => (
              <circle key={`${cx}-${cy}`} className="beer-bub" cx={cx} cy={cy} r={r} fill="#fff" style={{ animationDelay: `${delay}s` }} />
            ))}
        </g>
        {/* 泡の層（液面に乗る。0 では出さない） */}
        {lv > 0 && (
          <g className="beer-head" style={layer}>
            <path d={headPath(h)} fill={`url(#${id.foam})`} stroke="#e6d3a5" strokeWidth=".9" />
            <g fill="#f1e3bd">
              {HEAD_DOTS.map(([x, f]) => (
                <circle key={x} cx={x} cy={-h * f} r={h > 5 ? 0.9 : 0.7} />
              ))}
            </g>
            <rect x="0" y="-1.2" width="80" height="2.4" fill="#f3e2b3" opacity=".9" />
          </g>
        )}
      </g>

      {/* 溢れる泡（4 だけ） */}
      <g className={`beer-over${lv === 4 ? " on" : ""}`}>
        <g className="beer-wob">
          <path d={`${OVER_EDGE} Z`} fill={`url(#${id.foam})`} />
          {/* 輪郭は外側だけ（下の辺には線を引かない。平らな角を見せない） */}
          <path d={OVER_EDGE} fill="none" stroke="#e6d3a5" strokeWidth=".9" strokeLinecap="round" />
          <g fill="#ecd9ad" opacity=".8">
            <circle cx="17" cy="16" r=".9" />
            <circle cx="24" cy="9" r=".8" />
            <circle cx="31" cy="15" r=".9" />
            <circle cx="38" cy="6" r=".8" />
            <circle cx="45" cy="13" r=".9" />
            <circle cx="52" cy="10" r=".8" />
            <circle cx="20" cy="22" r=".7" />
            <circle cx="49" cy="20" r=".7" />
            <circle cx="34" cy="2" r=".7" />
            <circle cx="56" cy="16" r=".7" />
          </g>
          <g fill="#fff" opacity=".9">
            <ellipse cx="22" cy="5.5" rx="3.2" ry="1.6" transform="rotate(-18 22 5.5)" />
            <ellipse cx="11" cy="12" rx="1.8" ry="1" transform="rotate(-40 11 12)" />
          </g>
        </g>
        {/* 垂れる泡（輪郭の線なし） */}
        <path
          className="beer-drip"
          d="M8.5 25 C8 30 7.6 34 9 37.5 C10.4 40.5 12.6 38.5 12.2 34 C11.9 30.5 12 28 12.3 25 Z"
          fill={`url(#${id.foamDrip})`}
          opacity=".95"
        />
        <path
          className="beer-drip"
          d="M54.2 25 C54 28.5 54 31 55 33.5 C56.2 35.8 58 34 57.6 31 C57.3 29 57.4 27 57.6 25 Z"
          fill={`url(#${id.foamDrip})`}
          opacity=".95"
          style={{ transitionDelay: ".55s" }}
        />
        {/* はじける泡つぶ */}
        <circle className="beer-pop" cx="18" cy="6" r="1.6" fill="#fffaf0" stroke="#ecdcb6" strokeWidth=".5" style={{ "--dx": "-6px" } as CSSProperties} />
        <circle
          className="beer-pop"
          cx="48"
          cy="5"
          r="1.3"
          fill="#fffaf0"
          stroke="#ecdcb6"
          strokeWidth=".5"
          style={{ "--dx": "6px", animationDelay: ".8s" } as CSSProperties}
        />
      </g>

      {/* ジョッキの胴（上は開ける）・縁・つや・底 */}
      <path d="M12 20 V82 Q12 88 18 88 H48 Q54 88 54 82 V20" fill="none" stroke="#c4bdb5" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M12.6 20 H53.4" stroke="#ddd8d2" strokeWidth="1" strokeLinecap="round" />
      <rect x="18" y="26" width="5" height="54" rx="2.5" fill={`url(#${id.shine})`} />
      <path d="M13 84 Q13.5 87.5 18 87.5 H48 Q52.5 87.5 53 84" fill="none" stroke="#d6d0c9" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
