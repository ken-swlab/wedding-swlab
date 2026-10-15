"use client";

import { useEffect, useRef, useState } from "react";
import { OPENING_COLORS, OPENING_TIMING, REACTION_MAX_MS, REACTION_MIN_MS } from "@/config/opening";
import { createTimeline, prefersReducedMotion } from "./timeline";

/**
 * 長押しの状態。
 *   intro    … Take your marks を出している（まだ押せない）
 *   ready    … 「長押しで構える」を出して待っている
 *   stance   … 指を置いた直後（STANCE までに離したら静かに ready へ戻す）
 *   holding  … 構えた（ここで離すとフライング）
 *   starting … START を出すと決めた〜その絵が描かれるフレームまで（ここで離してもフライング）
 *   started  … START が描かれた（ここで離した時刻がリアクションタイム）
 *   foul     … 「フライング！」を出している
 *   done     … 結果が決まった
 */
type Hold = "intro" | "ready" | "stance" | "holding" | "starting" | "started" | "foul" | "done";

const WORDS = ["Take", "your", "marks"] as const;

/**
 * 3〜4. Take your marks → 長押しで構え、START の合図で指を離す。離すまでの時間がリアクションタイム。
 *
 * ★計測★ 基準は「START が描かれたフレームの時刻」（requestAnimationFrame の timestamp）、
 *   終わりは pointerup の event.timeStamp。どちらもページを開いてからの同じ時計（performance.now と同じ）。
 * ★START までの残り時間を示すものを出さない★（進捗バーなど）。合図が読めてしまう。
 *   待つ時間は毎回ランダム（startDelayMin〜startDelayMax）。
 * ★判定★
 *   構える前（stance）に離した → フライングにせず、静かに「長押しで構える」に戻す
 *   構えたあと、START の前に離した → フライング（やり直し）
 *   START から REACTION_MIN_MS 未満で離した → 合図を予測した反応とみなしてフライング（やり直し）
 *   START から noReaction のあいだ離さない → 反応なし（記録せずに先へ進む）
 * ★長押しで iOS の選択・コピーのメニューを出さない★ 親（Opening）の舞台が user-select / touch-callout /
 *   contextmenu を止めている。ここでは pointerdown を preventDefault する。
 * ★タッチはネイティブのイベントで聞く★ passive でない pointerdown が要る（preventDefault するため）。
 *
 * ★止まったままにしない★（Issue #157 A-2）案内を出してから一度も指を置かないまま idleEmphasis（5 秒）で
 *   丸と案内を大きくし、idleSkip（10 秒）で「スキップして招待状へ」を下に大きめに出す（右上のスキップと同じ）。
 *
 * onResult: 有効なタイム（ms の整数）か、反応なしの null。1回だけ呼ぶ。
 * onSkip: 「スキップして招待状へ」。
 */
export function StartScene({ onResult, onSkip }: { onResult: (reactionMs: number | null) => void; onSkip: () => void }) {
  const [words, setWords] = useState(0);
  const [hint, setHint] = useState(false);
  const [tense, setTense] = useState(false);
  const [markHidden, setMarkHidden] = useState(false);
  const [foul, setFoul] = useState<string | null>(null);
  // 0: ふつう → 1: 案内を大きく → 2: スキップを大きく出す（一度も指を置かないまま待っているとき）
  const [idle, setIdle] = useState<0 | 1 | 2>(0);

  const root = useRef<HTMLElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const startText = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const result = useRef(onResult);
  useEffect(() => {
    result.current = onResult;
  }, [onResult]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const t = createTimeline();
    const reduce = prefersReducedMotion();

    let hold: Hold = "intro";
    let pointer: number | null = null;
    let stanceTimer: ReturnType<typeof setTimeout> | null = null;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let noReactionTimer: ReturnType<typeof setTimeout> | null = null;
    let idleTimers: ReturnType<typeof setTimeout>[] | null = null;
    let touched = false;
    let frame = 0;
    let startAt = 0;

    function clearTimers() {
      t.clear(stanceTimer);
      t.clear(startTimer);
      t.clear(noReactionTimer);
      stanceTimer = startTimer = noReactionTimer = null;
      cancelAnimationFrame(frame);
    }

    function ready() {
      hold = "ready";
      pointer = null;
      setHint(true);
      // 初めて案内を出したときだけ、待ち続けている人への案内を仕込む
      if (!touched && !idleTimers) {
        idleTimers = [t.after(OPENING_TIMING.idleEmphasis, () => setIdle(1)), t.after(OPENING_TIMING.idleSkip, () => setIdle(2))];
      }
    }

    function finish(reactionMs: number | null) {
      clearTimers();
      hold = "done";
      setTense(false);
      result.current(reactionMs);
    }

    function flying(message: string) {
      clearTimers();
      hold = "foul";
      pointer = null;
      setTense(false);
      setMarkHidden(false);
      setFoul(message);
      t.after(OPENING_TIMING.foulShow, () => {
        setFoul(null);
        ready();
      });
    }

    function go() {
      hold = "starting";
      setMarkHidden(true);
      // 画面が白く光り「START」（音は使わない）
      flash.current?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: OPENING_TIMING.startFlash });
      startText.current?.animate(
        reduce
          ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }]
          : [{ opacity: 0, transform: "scale(1.4)" }, { opacity: 1, transform: "scale(1)", offset: 0.2 }, { opacity: 0, transform: "scale(1)" }],
        { duration: OPENING_TIMING.startFlash },
      );
      // ★START が描かれるフレームの時刻を基準にする★
      frame = requestAnimationFrame((ts) => {
        startAt = ts;
        if (hold === "starting") hold = "started";
      });
      noReactionTimer = t.after(OPENING_TIMING.noReaction, () => {
        if (hold === "started") finish(null);
      });
    }

    function onDown(e: PointerEvent) {
      if (hold !== "ready" || (e.target instanceof Element && e.target.closest("button"))) return;
      e.preventDefault();
      if (!touched) {
        touched = true;
        idleTimers?.forEach((h) => t.clear(h));
        setIdle(0);
      }
      hold = "stance";
      pointer = e.pointerId;
      setHint(false);
      stanceTimer = t.after(OPENING_TIMING.stance, () => {
        if (hold === "stance") {
          hold = "holding";
          setTense(true);
        }
      });
      const delay = OPENING_TIMING.startDelayMin + Math.random() * (OPENING_TIMING.startDelayMax - OPENING_TIMING.startDelayMin);
      startTimer = t.after(delay, go);
    }

    function onUp(e: PointerEvent) {
      // 構えた指だけを見る（2本目の指の上げ下げは無視する）
      if (pointer !== null && e.pointerId !== pointer) return;
      if (hold === "stance") {
        clearTimers();
        ready();
        return;
      }
      if (hold === "holding" || hold === "starting") {
        flying("もう一度、長押しで構える");
        return;
      }
      if (hold !== "started") return;
      const at = e.timeStamp > 0 ? e.timeStamp : performance.now();
      const elapsed = at - startAt;
      if (elapsed < REACTION_MIN_MS) {
        flying("合図を予測した反応（0.10秒未満）はフライングです");
        return;
      }
      // 保存はミリ秒の整数（表示は 1/100 秒・切り捨て。lib/opening-names.ts の formatReaction）
      finish(Math.min(REACTION_MAX_MS, Math.floor(elapsed)));
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    const pulse = reduce
      ? null
      : ring.current?.animate([{ transform: "scale(1)" }, { transform: "scale(0.7)" }, { transform: "scale(1)" }], {
          duration: 1400,
          iterations: Infinity,
          easing: "ease-in-out",
        });

    void (async () => {
      setWords(1);
      await t.sleep(OPENING_TIMING.afterTake);
      setWords(2);
      await t.sleep(OPENING_TIMING.afterYour);
      setWords(3);
      await t.sleep(OPENING_TIMING.afterMarks);
      ready();
    })();

    return () => {
      t.cancel();
      cancelAnimationFrame(frame);
      pulse?.cancel();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <section ref={root} className="absolute inset-0" style={{ background: "#000", color: OPENING_COLORS.ink }}>
      {/* 構えると画面が少し寄る */}
      <div className="absolute inset-0 transition-transform duration-[1200ms] ease-out motion-reduce:transition-none" style={{ transform: tense ? "scale(1.04)" : "scale(1)" }}>
        <p className="absolute inset-x-0 top-[36%] text-center text-[30px] font-extrabold tracking-[0.06em]" style={{ visibility: markHidden ? "hidden" : "visible" }}>
          {WORDS.map((w, i) => (
            <span key={w} className="transition-opacity duration-100" style={{ opacity: words > i ? 1 : 0 }}>
              {w}
              {i < WORDS.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
        <div className="absolute inset-x-0 bottom-[14%] flex flex-col items-center gap-3 transition-opacity duration-300" style={{ opacity: hint ? 1 : 0 }}>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className={`relative block h-16 w-16 rounded-full border-2 border-white/70 transition-transform duration-500 motion-reduce:transition-none ${idle >= 1 ? "start-idle-pulse scale-125" : ""}`}
            >
              <span ref={ring} className="absolute inset-[14px] rounded-full bg-white/85" />
            </span>
            <PressIcon />
          </div>
          <p className={`tracking-[0.1em] text-white/90 transition-[font-size] ${idle >= 1 ? "mt-2 text-lg font-bold" : "text-sm"}`}>長押しで構える</p>
          <p className={`tracking-[0.08em] text-white/70 ${idle >= 1 ? "text-sm" : "text-xs"}`}>START の合図で指を離す</p>
        </div>
        {idle >= 2 && (
          <div className="welcome-fade-in absolute inset-x-6 flex justify-center" style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
            <button
              type="button"
              onClick={onSkip}
              className="min-h-12 w-full max-w-[20rem] touch-manipulation rounded-full border border-white/40 bg-white/15 px-6 text-[15px] font-medium text-white"
            >
              スキップして招待状へ
            </button>
          </div>
        )}
      </div>

      <div ref={flash} aria-hidden className="pointer-events-none absolute inset-0 z-20 bg-white opacity-0" />
      <div ref={startText} aria-hidden className="pointer-events-none absolute inset-0 z-[21] flex items-center justify-center text-[64px] font-black tracking-[0.08em] text-black opacity-0">
        START
      </div>
      <div
        role="alert"
        className="pointer-events-none absolute inset-x-6 top-[38%] z-[22] rounded-2xl bg-black/80 py-[18px] text-center text-[34px] font-black transition-opacity duration-200"
        style={{ opacity: foul ? 1 : 0, color: OPENING_COLORS.led }}
      >
        {foul && (
          <>
            フライング！
            <small className="mt-2 block px-3 text-[13px] font-medium tracking-[0.1em] text-white/80">{foul}</small>
          </>
        )}
      </div>
    </section>
  );
}

/** 長押しの指の絵（Issue #157 A-2）。丸の横に添える */
function PressIcon() {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className="h-9 w-9 text-white/80" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V6.5a2 2 0 0 1 4 0V14" />
      <path d="M16 13.5v-1.5a2 2 0 0 1 4 0V15" />
      <path d="M20 14a2 2 0 0 1 4 0v4.5c0 4.7-3.3 8.5-8 8.5h-1.2c-2.4 0-4.2-1-5.6-2.9L5.6 19.2a2 2 0 0 1 3.1-2.5L12 20" />
      <path d="M9 4.5a6 6 0 0 1 10 0" opacity="0.6" />
    </svg>
  );
}
