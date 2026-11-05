"use client";

import { useEffect, useRef, useState } from "react";
import { OPENING_COLORS } from "@/config/opening";
import { createTimeline, prefersReducedMotion } from "@/components/opening/timeline";
import { ENVELOPE_LETTER } from "@/components/guestbook/Envelope";

/** 紙が広がる時間 (ms)・広がったあと色が変わる（消える）時間 (ms) */
export const PAPER_EXPAND_MS = 600;
export const PAPER_SETTLE_MS = 280;

/** 広がり始める紙の位置（画面の座標） */
export type PaperRect = { left: number; top: number; width: number; height: number };

/**
 * 封筒から飛び出した便せんが、画面いっぱいに広がる紙（Issue #267 のあと。「LINE でログイン」のあと）。
 *
 *   cover  … 入口で使う。便せんの位置（from）から画面いっぱいに広がり、紙の色が次の画面の地の色（OPENING_COLORS.calm）に
 *            変わったら onCovered（ここで LINE のログインを始める）。そのあとも画面を覆ったまま（ログインの間、入口を隠す）。
 *   reveal … パスコードの画面で使う。LINE の画面から戻ってきたとき（入口の紙は消えている）に、画面の中ほどの
 *            便せんの大きさから広げ直し、広がったら紙ごと消えて、下のパスコードの画面が現れる。
 *
 * ★大きさは clip-path で変える★ 紙は初めから画面いっぱいの1枚で、見える範囲だけを広げる（transform の scale だと
 *   角の丸み・文字がゆがむ。width・height を動かすより軽い）。
 * ★便せんの文字（INVITATION）は、広がり始めにすぐ消す★ 便せんの上に同じ文字を重ねて始め、紙だけが広がって見えるように。
 * 動きを減らす設定では描かない（cover は呼び出し側が待たずに進む）。
 */
export function PaperSheet({ mode, from, onCovered }: { mode: "cover" | "reveal"; from?: PaperRect | null; onCovered?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [start] = useState<PaperRect | null>(() => from ?? null);
  const [done, setDone] = useState(false);
  const coveredRef = useRef(onCovered);
  useEffect(() => {
    coveredRef.current = onCovered;
  }, [onCovered]);

  useEffect(() => {
    const root = rootRef.current;
    const sheet = sheetRef.current;
    if (!root || !sheet) return;
    const t = createTimeline();
    const vw = root.clientWidth;
    const vh = root.clientHeight;
    // 位置が無いとき（reveal）は、入口の便せんと同じくらいの大きさで、画面の中ほどから
    const r = start ?? { width: 112, height: 78, left: (vw - 112) / 2, top: vh * 0.42 - 39 };
    const from = `inset(${r.top}px ${vw - r.left - r.width}px ${vh - r.top - r.height}px ${r.left}px round 3px)`;
    const run = async () => {
      if (labelRef.current) void t.play(labelRef.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out", fill: "forwards" });
      await t.play(sheet, [{ clipPath: from }, { clipPath: "inset(0px 0px 0px 0px round 0px)" }], {
        duration: PAPER_EXPAND_MS,
        easing: "cubic-bezier(.6,0,.2,1)",
        fill: "forwards",
      });
      if (mode === "cover") {
        await t.play(sheet, [{ backgroundColor: ENVELOPE_LETTER }, { backgroundColor: OPENING_COLORS.calm }], { duration: PAPER_SETTLE_MS, easing: "ease-out", fill: "forwards" });
        coveredRef.current?.();
      } else {
        await t.play(root, [{ opacity: 1 }, { opacity: 0 }], { duration: PAPER_SETTLE_MS + 120, easing: "ease-out", fill: "forwards" });
        setDone(true);
      }
    };
    void run();
    return () => t.cancel();
  }, [mode, start]);

  if (done || prefersReducedMotion()) return null;
  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      // ★cover は押せないようにする★ ログインの間、下の入口のボタンを押させない。reveal は下のパスコードの入力を邪魔しない
      className={`fixed inset-0 z-50 ${mode === "cover" ? "" : "pointer-events-none"}`}
      style={{ background: mode === "reveal" ? OPENING_COLORS.calm : undefined }}
    >
      <div ref={sheetRef} className="absolute inset-0" style={{ background: ENVELOPE_LETTER, clipPath: "inset(50% 50% 50% 50%)" }} />
      {start && (
        <div ref={labelRef} className="absolute" style={{ left: start.left, top: start.top, width: start.width }}>
          <span className="mt-[11px] block text-center font-serif text-[9px] tracking-[0.3em]" style={{ color: "#8a7f72", paddingLeft: "0.3em" }}>
            INVITATION
          </span>
          <span className="mx-auto mt-[7px] block h-px w-[54px]" style={{ background: "#d8cfc2" }} />
          <span className="mx-auto mt-[4px] block h-px w-[38px]" style={{ background: "#d8cfc2" }} />
        </div>
      )}
    </div>
  );
}
