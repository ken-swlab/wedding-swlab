"use client";

import { useEffect, useRef, useState } from "react";
import { CALL_LINE_Y, OPENING_COLORS, OPENING_TIMING } from "@/config/opening";
import { createTimeline, prefersReducedMotion } from "./timeline";

const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const SERIF = '"Hiragino Mincho ProN", "Noto Serif JP", "Yu Mincho", serif';

/** 区切り線の幅 (px)。パスコードの4つの枠が縮んだ線（PasscodeStep）と同じ */
const RULE_WIDTH_PX = 120;

/** 区切り線（画面の CALL_LINE_Y）からの位置 (px)。試作（docs/prototypes/transitions_prototype.html）と同じ */
const OFFSET = { slam: -118, sub: -36, ripple: -82, date: 22, venue: 82 } as const;

const at = (dy: number) => `calc(${CALL_LINE_Y * 100}% + ${dy}px)`;

/**
 * 1. 招集（Issue #165 で「ドン！」と始める形に作り直した）。
 *   区切り線 → 溜め →「招集」を叩きつける（同時に 揺れ・線が横に伸びる・波紋）→「のお知らせ」→ 日付 → 会場（1文字ずつ）。
 * 日付と会場は config/invitation の opening から（API がパスコードを通った人にだけ返す）。
 *
 * ★intro="passcode" のときは、区切り線が最初からある★ パスコードの4つの枠が縮んだ線（PasscodeStep）が、
 *   同じ位置・同じ幅・同じ色でここへ運ばれてくる。見返し（パスコードなし）では、線を中央から伸ばす。
 * ★動きを減らす設定では、揺れ・波紋・拡大縮小を省き、フェードで出す★ 文字は出す。
 * ★動かすのは transform・opacity・filter だけ★ 位置は CALL_LINE_Y からの固定の距離で決める。
 */
export function CallScene({ date, venue, intro, onDone }: { date: string; venue: string; intro?: "passcode"; onDone: () => void }) {
  const [shown, setShown] = useState({ date: "", venue: "" });
  const root = useRef<HTMLElement>(null);
  const rule = useRef<HTMLDivElement>(null);
  const slam = useRef<HTMLParagraphElement>(null);
  const sub = useRef<HTMLParagraphElement>(null);
  const ripple = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  // 線は最初の描画から置いておく（パスコードの線と入れ替わったときに、1フレームも消さない）
  const [fromPasscode] = useState(intro === "passcode");

  useEffect(() => {
    const t = createTimeline();
    const reduce = prefersReducedMotion();
    async function type(key: "date" | "venue", text: string) {
      const chars = Array.from(text);
      for (let i = 0; i < chars.length; i++) {
        const head = chars.slice(0, i + 1).join("");
        setShown((s) => ({ ...s, [key]: head }));
        await t.sleep(/[0-9A-Za-z.]/.test(chars[i]) ? OPENING_TIMING.callCharAscii : OPENING_TIMING.callCharJa);
      }
    }
    void (async () => {
      if (!fromPasscode) {
        await t.sleep(OPENING_TIMING.callLeadIn);
        await t.play(rule.current, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
          duration: reduce ? 1 : OPENING_TIMING.lineDraw,
          easing: "cubic-bezier(.2,.8,.2,1)",
          fill: "forwards",
        });
      }
      await t.sleep(OPENING_TIMING.slamWindup);
      // ドン！:「招集」を叩きつける
      void t.play(
        slam.current,
        reduce
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: "scale(2.6)", filter: "blur(6px)" },
              { opacity: 1, transform: "scale(.94)", filter: "blur(0)", offset: 0.72 },
              { opacity: 1, transform: "scale(1)", filter: "blur(0)" },
            ],
        { duration: reduce ? OPENING_TIMING.slamSub : OPENING_TIMING.slam, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
      );
      await t.sleep(OPENING_TIMING.slamImpact);
      if (!reduce) {
        // 叩きつけの瞬間に、揺れ・線の伸び・波紋を同時に出す
        void t.play(
          root.current,
          [
            { transform: "translate(0, 0)" },
            { transform: "translate(-5px, 3px)" },
            { transform: "translate(4px, -3px)" },
            { transform: "translate(-2px, 2px)" },
            { transform: "translate(0, 0)" },
          ],
          { duration: OPENING_TIMING.shake },
        );
        void t.play(rule.current, [{ transform: "scaleX(1)" }, { transform: "scaleX(2.2)" }, { transform: "scaleX(1.6)" }], {
          duration: OPENING_TIMING.ruleStretch,
          easing: "cubic-bezier(.2,.8,.2,1)",
          fill: "forwards",
        });
        void t.play(ripple.current, [{ opacity: 0.7, transform: "scale(.6)" }, { opacity: 0, transform: "scale(7)" }], {
          duration: OPENING_TIMING.ripple,
          easing: "cubic-bezier(.2,.7,.3,1)",
          fill: "forwards",
        });
      }
      await t.sleep(OPENING_TIMING.slamSubDelay);
      void t.play(sub.current, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], {
        duration: OPENING_TIMING.slamSub,
        fill: "forwards",
      });
      await t.sleep(OPENING_TIMING.afterSlamSub);
      await type("date", date);
      await type("venue", venue);
      await t.sleep(OPENING_TIMING.callRead);
      done.current();
    })();
    return () => t.cancel();
  }, [date, venue, fromPasscode]);

  const ink = OPENING_COLORS.calmInk;
  return (
    <section ref={root} className="absolute inset-0 text-center" style={{ background: OPENING_COLORS.calm, color: ink }}>
      {/* 読み上げには全文を一度だけ渡す（1文字ずつの変化は読ませない） */}
      <p className="sr-only">{`招集のお知らせ ${date} ${venue}`}</p>
      <p
        ref={slam}
        aria-hidden
        className="absolute inset-x-0 text-[72px] font-black leading-none tracking-[0.18em] opacity-0"
        style={{ top: at(OFFSET.slam), paddingLeft: "0.18em", fontFamily: SERIF }}
      >
        招集
      </p>
      <p
        ref={sub}
        aria-hidden
        className="absolute inset-x-0 text-[15px] font-semibold tracking-[0.5em] opacity-0"
        style={{ top: at(OFFSET.sub), paddingLeft: "0.5em" }}
      >
        のお知らせ
      </p>
      <div
        ref={ripple}
        aria-hidden
        className="pointer-events-none absolute left-1/2 h-[60px] w-[60px] rounded-full border-2 opacity-0"
        style={{ top: at(OFFSET.ripple), margin: "-30px 0 0 -30px", borderColor: `${OPENING_COLORS.water1}99` }}
      />
      {/* ★区切り線の中心を CALL_LINE_Y に置く★ パスコードの線（PasscodeStep）も、中心をここへ運ぶ */}
      <div
        ref={rule}
        aria-hidden
        className="absolute left-1/2 h-px"
        style={{
          top: at(0),
          width: RULE_WIDTH_PX,
          marginLeft: -RULE_WIDTH_PX / 2,
          background: ink,
          opacity: 0.45,
          transform: fromPasscode ? "scaleX(1)" : "scaleX(0)",
        }}
      />
      <p aria-hidden className="absolute inset-x-0 min-h-[1.2em] break-all px-4 text-[38px] font-extrabold leading-tight tracking-[0.12em] tabular-nums" style={{ top: at(OFFSET.date), fontFamily: MONO }}>
        {shown.date}
      </p>
      <p aria-hidden className="absolute inset-x-0 min-h-[1.2em] px-4 text-[18px] font-semibold tracking-[0.35em]" style={{ top: at(OFFSET.venue) }}>
        {shown.venue}
      </p>
    </section>
  );
}
