"use client";

import { useEffect, useRef, useState } from "react";
import { ENTRY_AUTO_ADVANCE_MS, LANE_GUEST, OPENING_COLORS } from "@/config/opening";
import { createTimeline, prefersReducedMotion } from "./timeline";

const MONO = "ui-monospace, Menlo, monospace";

/** 1行ずつ出す間隔と、FINISH を点灯させるまでの間 (ms)。合計 2〜3 秒以内に収める（Issue #149） */
const ENTRY_TIMING = {
  firstLine: 300,
  beforeFinish: 600,
  finishBlink: 700,
  beforeName: 450,
  beforeBody: 450,
} as const;

/**
 * 回答の送信完了「エントリー完了」（Issue #149）。オープニング（招集）の電光掲示板の続き。
 *   EVENT 1　ENTRY → FINISH（点灯）→ 4　{ゲストの名前} → 本文
 *
 * ★ボタンは置かず、自動で承認待ちへ進む★（Issue #156）出そろってから ENTRY_AUTO_ADVANCE_MS（3 秒）で onNext。
 *   画面のどこをタップしても、すぐ進む（出そろう前でも）。自動で進むことは、画面下の細い線が伸びることで伝える
 *   （文字では書かない）。onNext は 1 回だけ呼ぶ。
 * ★演出は合計 2〜3 秒以内★ prefers-reduced-motion では動きを省き、最初から全部出す（線も出さない。進む時間は同じ）。
 * ★初回の送信のときだけ出す★ 回答の修正（/guide/questionnaire・/onboarding からの送り直し）では出さない。
 *   出すかどうかは呼び出し側が決める。
 * ★ゲストの名前はオープニングと同じ表示★（lib/opening-names.ts の classifyDisplayName の guest）。
 */
export function EntryFinish({ guestName, onNext }: { guestName: string; onNext: () => void }) {
  // 0: 何も出ていない → 1: EVENT 1 ENTRY → 2: FINISH（点滅して点灯）→ 3: 名前 → 4: 本文とボタン
  // ★動きを減らす設定なら最初から全部出す★（送信のあとに出す画面なので、サーバーで描くことはない）
  const [reduce] = useState(() => typeof window !== "undefined" && prefersReducedMotion());
  const [stage, setStage] = useState(reduce ? 4 : 0);
  const [blink, setBlink] = useState(false);
  const line = useRef<HTMLDivElement>(null);

  // ★onNext は 1 回だけ★ タップと時間切れが重なっても、承認待ちへの遷移を二重にしない。
  //   呼び出し側は毎回新しい関数を渡すので、ref に持って効果を作り直さない
  const onNextRef = useRef(onNext);
  const advanced = useRef(false);
  useEffect(() => {
    onNextRef.current = onNext;
  }, [onNext]);
  const advance = () => {
    if (advanced.current) return;
    advanced.current = true;
    onNextRef.current();
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const t = createTimeline();
    void (async () => {
      if (!reduce) {
        await t.sleep(ENTRY_TIMING.firstLine);
        setStage(1);
        await t.sleep(ENTRY_TIMING.beforeFinish);
        setStage(2);
        setBlink(true);
        await t.sleep(ENTRY_TIMING.finishBlink);
        setBlink(false);
        await t.sleep(ENTRY_TIMING.beforeName);
        setStage(3);
        await t.sleep(ENTRY_TIMING.beforeBody);
        setStage(4);
        // 線は待たない（伸ばしながら時間を数える）
        void t.play(line.current, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
          duration: ENTRY_AUTO_ADVANCE_MS,
          easing: "linear",
          fill: "forwards",
        });
      }
      await t.sleep(ENTRY_AUTO_ADVANCE_MS);
      if (advanced.current) return;
      advanced.current = true;
      onNextRef.current();
    })();
    return () => t.cancel();
  }, [reduce]);

  const show = (n: number) => ({
    opacity: stage >= n ? 1 : 0,
    transform: stage >= n ? "none" : "translateY(6px)",
    transition: "opacity 300ms ease-out, transform 300ms ease-out",
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-finish-title"
      onClick={advance}
      className="fixed inset-0 z-[100] flex cursor-pointer touch-manipulation flex-col items-center justify-center overflow-y-auto px-6 text-center"
      style={{ background: "#000", color: OPENING_COLORS.ink, paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="w-full max-w-[22rem]" style={{ fontFamily: MONO }}>
        <p className="text-[13px] tracking-[0.35em]" style={{ ...show(1), color: OPENING_COLORS.dim }}>
          EVENT 1　ENTRY
        </p>
        <p
          id="entry-finish-title"
          className={`mt-4 text-[56px] font-extrabold leading-none tracking-[0.12em] ${blink ? "entry-finish-blink" : ""}`}
          style={{ ...show(2), color: OPENING_COLORS.led, textShadow: stage >= 2 ? `0 0 18px ${OPENING_COLORS.led}66` : "none" }}
        >
          FINISH
        </p>
        <div
          className="mt-8 flex items-center gap-4 border-y py-3 text-left"
          style={{ ...show(3), borderColor: OPENING_COLORS.laneLine }}
        >
          <span className="w-8 shrink-0 text-center text-xl" style={{ color: OPENING_COLORS.led }}>
            {LANE_GUEST}
          </span>
          <span className="min-w-0 flex-1 truncate text-lg font-bold" style={{ color: OPENING_COLORS.led }}>
            {guestName}
          </span>
        </div>
      </div>

      <div className="mt-10 w-full max-w-[22rem]" style={show(4)}>
        <p className="text-[15px] leading-[1.9]">
          エントリー、完了です。
          <br />
          新郎新婦の確認が終わると、次のステージへ進めます。
        </p>
      </div>

      {/* 自動で進むまでの残り時間。文字は出さない（Issue #156）。動きを減らす設定では出さない */}
      {!reduce && (
        <div
          ref={line}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-[2px] origin-left"
          style={{ bottom: "env(safe-area-inset-bottom)", background: OPENING_COLORS.led, transform: "scaleX(0)" }}
        />
      )}
    </div>
  );
}
