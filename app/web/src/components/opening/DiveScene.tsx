"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DIVE_BUBBLES, OPENING_COLORS, OPENING_TIMING, SPLASH_DROPS } from "@/config/opening";
import { formatReaction } from "@/lib/opening-names";
import { createTimeline, prefersReducedMotion } from "./timeline";

const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

/**
 * 5. 飛び込み。指を離す → 水しぶきと水が満ちる → 水しぶきの上にタイムを表示 → 終わり。
 *
 * ★この場面だけを差し替えられるようにしてある★ 将来、動画や WebGL に置き換えるときは、
 *   同じ props（reactionMs / note / onDone）の部品を作って Opening から呼ぶ。
 * ★動かすのは transform と opacity だけ★ 水は高さを伸ばさず、画面より少し背の高い板を下から持ち上げる。
 * ★動きを減らす設定では、水しぶき・泡・水の動きを省く★ タイムは出す。
 *
 * reactionMs が null のときは「反応なし」。note はタイムの下に添える一言（記録するか・しないか）。
 *
 * ★under があれば、水面から顔を出す★（Issue #165）水が満ちた時点で、水の下に under（招待状）を
 *   ぼかし 7px・拡大 1.04 倍で用意し、タイムを消したあと水を下へ引かせる。同時に、ぼかしと拡大を戻す。
 *   引ききったら水の板を display: none にして（波の端を画面の下に残さない）、onDone。
 *   under が無ければ（見返し）、これまでどおり水が満ちたままタイムを消して onDone。
 */
export function DiveScene({ reactionMs, note, under, onDone }: { reactionMs: number | null; note: string; under?: ReactNode; onDone: () => void }) {
  const [timeOn, setTimeOn] = useState(false);
  /** 水の下の招待状: hidden → ready（ぼけた状態で見える）→ clear（はっきり） */
  const [underState, setUnderState] = useState<"hidden" | "ready" | "clear">("hidden");
  const hasUnder = useRef(under != null);
  const root = useRef<HTMLElement>(null);
  const water = useRef<HTMLDivElement>(null);
  const wave = useRef<SVGSVGElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const stage = root.current;
    const pool = water.current;
    if (!stage || !pool) return;
    const t = createTimeline();
    const reduce = prefersReducedMotion();
    const made: HTMLElement[] = [];
    const loops: Animation[] = [];

    if (!reduce) {
      const W = stage.clientWidth;
      const H = stage.clientHeight;
      // 水しぶき: 画面の下の中央から、上へ扇形に飛んで落ちる
      for (let i = 0; i < SPLASH_DROPS; i++) {
        const d = document.createElement("div");
        const r = 4 + Math.random() * 9;
        d.style.cssText = `position:absolute;z-index:31;pointer-events:none;border-radius:50%;width:${r}px;height:${r}px;left:${W / 2 - r / 2}px;top:${H * 0.78}px;background:${OPENING_COLORS.drop}`;
        stage.appendChild(d);
        made.push(d);
        const angle = ((-90 + (Math.random() * 130 - 65)) * Math.PI) / 180;
        const speed = H * (0.35 + Math.random() * 0.35);
        const dx = Math.cos(angle) * speed * 0.8;
        const dy = Math.sin(angle) * speed;
        void t
          .play(
            d,
            [
              { transform: "translate(0px, 0px)", opacity: 1 },
              { transform: `translate(${dx}px, ${dy}px)`, opacity: 0.9, offset: 0.55 },
              { transform: `translate(${dx * 1.25}px, ${dy * 0.35 + H * 0.25}px)`, opacity: 0 },
            ],
            { duration: 900 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" },
          )
          .then(() => d.remove());
      }
      // 泡: 水の中を下から上へ
      for (let i = 0; i < DIVE_BUBBLES; i++) {
        const b = document.createElement("div");
        const s = 6 + Math.random() * 16;
        b.style.cssText = `position:absolute;bottom:-20px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.6);width:${s}px;height:${s}px;left:${Math.random() * 100}%`;
        pool.appendChild(b);
        made.push(b);
        void t.play(b, [{ transform: "translateY(0)", opacity: 1 }, { transform: `translateY(${-H * 1.1}px)`, opacity: 0 }], {
          duration: 1200 + Math.random() * 1200,
          delay: Math.random() * 600,
          easing: "linear",
          fill: "forwards",
        });
      }
      // 水面の波（横へ流れ続ける）
      if (wave.current) loops.push(wave.current.animate([{ transform: "translateX(0)" }, { transform: "translateX(-50%)" }], { duration: 1600, iterations: Infinity }));
    }

    void (async () => {
      const fill = t.play(pool, [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], {
        duration: reduce ? 1 : OPENING_TIMING.waterFill,
        easing: "cubic-bezier(.6,0,.3,1)",
        fill: "forwards",
      });
      // 水しぶきの間はタイムを出さない
      await t.sleep(OPENING_TIMING.timeDelay);
      setTimeOn(true);
      await fill;
      if (!hasUnder.current) {
        await t.sleep(OPENING_TIMING.timeShow);
        setTimeOn(false);
        await t.sleep(OPENING_TIMING.timeFade);
        done.current();
        return;
      }
      // 水の下に招待状を用意しておく（水が満ちているので、まだ見えない）
      setUnderState("ready");
      await t.sleep(OPENING_TIMING.timeShow);
      setTimeOn(false);
      await t.sleep(OPENING_TIMING.revealGap);
      // 水面から顔を出す: 水が下へ引き、招待状のぼけが取れていく
      setUnderState("clear");
      await t.play(pool, [{ transform: "translateY(0)" }, { transform: "translateY(calc(100% + 24px))" }], {
        duration: reduce ? 1 : OPENING_TIMING.waterRecede,
        easing: "cubic-bezier(.5,0,.3,1)",
        fill: "forwards",
      });
      pool.style.display = "none";
      done.current();
    })();

    return () => {
      t.cancel();
      loops.forEach((a) => a.cancel());
      made.forEach((el) => el.remove());
    };
  }, []);

  return (
    <section ref={root} className="absolute inset-0 overflow-hidden" style={{ background: "#000" }}>
      {under && (
        <div
          aria-hidden={underState !== "clear"}
          className="absolute inset-0 z-10 ease-out motion-reduce:transition-none"
          style={{
            opacity: underState === "hidden" ? 0 : 1,
            filter: underState === "clear" ? "blur(0)" : "blur(7px)",
            transform: underState === "clear" ? "scale(1)" : "scale(1.04)",
            transitionProperty: "filter, transform",
            transitionDuration: `${OPENING_TIMING.inviteUnblur}ms`,
          }}
        >
          {under}
        </div>
      )}
      <div
        ref={water}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[110%]"
        style={{ transform: "translateY(100%)", background: `linear-gradient(180deg, ${OPENING_COLORS.water1}, ${OPENING_COLORS.water2})` }}
      >
        <svg ref={wave} viewBox="0 0 200 24" preserveAspectRatio="none" className="absolute left-0 top-[-22px] h-6 w-[200%]">
          <path d="M0 12 Q12.5 0 25 12 T50 12 T75 12 T100 12 T125 12 T150 12 T175 12 T200 12 V24 H0Z" fill={OPENING_COLORS.water1} />
        </svg>
      </div>
      <div
        role="status"
        className="pointer-events-none absolute inset-0 z-[35] flex flex-col items-center justify-center gap-1.5 text-white transition-[opacity,transform] ease-out motion-reduce:transition-opacity"
        style={{
          opacity: timeOn ? 1 : 0,
          transform: timeOn ? "scale(1)" : "scale(0.92)",
          transitionDuration: `${timeOn ? OPENING_TIMING.timeFade : OPENING_TIMING.timeFadeOut}ms`,
          textShadow: "0 2px 14px rgba(0,0,0,0.45)",
        }}
      >
        <p className="text-xs tracking-[0.35em] text-white/80">REACTION TIME</p>
        <p className="text-[64px] font-extrabold leading-none tabular-nums" style={{ fontFamily: MONO }}>
          {reactionMs === null ? "--.--" : formatReaction(reactionMs)}
        </p>
        <p className="px-6 text-center text-xs tracking-[0.08em] text-white/70">{reactionMs === null ? "反応なし" : note}</p>
      </div>
    </section>
  );
}
