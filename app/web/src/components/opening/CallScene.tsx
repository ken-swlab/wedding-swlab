"use client";

import { useEffect, useRef, useState } from "react";
import { OPENING_COLORS, OPENING_TIMING } from "@/config/opening";
import { createTimeline } from "./timeline";

const TITLE = "招集のお知らせ";
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

/**
 * 1. 招集。「招集のお知らせ」→ 区切り線 → 日付 → 会場 の順に、1文字ずつ出す（文字を入れ替える演出はしない）。
 * 日付と会場は config/invitation の opening から（API がパスコードを通った人にだけ返す）。
 */
export function CallScene({ date, venue, onDone }: { date: string; venue: string; onDone: () => void }) {
  const [shown, setShown] = useState({ title: "", date: "", venue: "" });
  const [rule, setRule] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const t = createTimeline();
    async function type(key: "title" | "date" | "venue", text: string) {
      const chars = Array.from(text);
      for (let i = 0; i < chars.length; i++) {
        const head = chars.slice(0, i + 1).join("");
        setShown((s) => ({ ...s, [key]: head }));
        await t.sleep(/[0-9A-Za-z.]/.test(chars[i]) ? OPENING_TIMING.callCharAscii : OPENING_TIMING.callCharJa);
      }
    }
    void (async () => {
      await t.sleep(OPENING_TIMING.callLeadIn);
      await type("title", TITLE);
      setRule(true);
      await t.sleep(OPENING_TIMING.callAfterRule);
      await type("date", date);
      await type("venue", venue);
      await t.sleep(OPENING_TIMING.callRead);
      done.current();
    })();
    return () => t.cancel();
  }, [date, venue]);

  return (
    <section
      className="absolute inset-0 flex flex-col items-center justify-center gap-[18px] px-6 text-center"
      style={{ background: OPENING_COLORS.calm, color: OPENING_COLORS.calmInk }}
    >
      {/* 読み上げには全文を一度だけ渡す（1文字ずつの変化は読ませない） */}
      <p className="sr-only">{`${TITLE} ${date} ${venue}`}</p>
      <p aria-hidden className="min-h-[1.3em] text-[22px] font-bold tracking-[0.3em]">{shown.title}</p>
      {/* 幅ではなく transform で伸ばす（レイアウトを動かさない） */}
      <div
        aria-hidden
        className="h-px w-[120px] origin-center transition-transform duration-1000 ease-out"
        style={{ background: OPENING_COLORS.calmInk, opacity: 0.4, transform: rule ? "scaleX(1)" : "scaleX(0)" }}
      />
      <p aria-hidden className="min-h-[1.3em] break-all text-[40px] font-extrabold leading-tight tracking-[0.12em] tabular-nums" style={{ fontFamily: MONO }}>
        {shown.date}
      </p>
      <p aria-hidden className="min-h-[1.3em] text-[20px] font-semibold tracking-[0.35em]">{shown.venue}</p>
    </section>
  );
}
