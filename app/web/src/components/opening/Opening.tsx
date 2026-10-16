"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { OPENING_COLORS } from "@/config/opening";
import { CallScene } from "./CallScene";
import { LaneScene } from "./LaneScene";
import { StartScene } from "./StartScene";
import { DiveScene } from "./DiveScene";

export type OpeningResult = {
  /** 計測できたタイム (ms)。スキップ・反応なしなら null */
  reactionMs: number | null;
  /** スキップで終わったか */
  skipped: boolean;
};

type Scene = "call" | "lanes" | "start" | "dive";

/**
 * オープニング演出「招集」（Issue #131）。合言葉を通った直後に全画面で流す。音は使わない。
 *   招集 → レーン発表 → Take your marks → スタート（リアクションタイム）→ 飛び込み
 * 場面ごとに部品を分けてある（CallScene / LaneScene / StartScene / DiveScene）。タイミングは config/opening.ts。
 *
 * ★ここは見た目と計測だけ★ API は呼ばない。タイムを保存するか（一発勝負か、見返しか）は親が決める。
 *   onReaction … 有効なタイムが出た瞬間に1回（飛び込みの演出を待たずに保存を始められる）
 *   onFinish   … 終わったときに1回（飛び込みのあと・反応なし・スキップ）
 * ★新郎新婦の名前・日付・会場は props でだけ受け取る★ 定数として書かない（公開リポジトリ）。
 * ★長押しで iOS の選択・コピーのメニューを出さない★
 *   舞台全体で user-select と touch-callout を切り、contextmenu を止め、touch-action: none にする。
 * ★document.body へ Portal で出し、表示中は body を overflow: hidden にする★
 *   ゲストブックの中から開いたとき、引っ張って更新（PullToRefresh）が動かないようにする。
 */
export function Opening({
  couple,
  guestName,
  date,
  venue,
  note,
  intro,
  under,
  testDive,
  onReaction,
  onFinish,
}: {
  /** [新郎, 新婦]。ゲストの LINE 名の書き方に合わせた表記（lib/opening-names.ts） */
  couple: readonly [string, string];
  guestName: string;
  date: string;
  venue: string;
  /** タイムの下に添える一言 */
  note: string;
  /** passcode … パスコードの枠が縮んだ線から「招集」を始める（Issue #165）。無ければ線を中央から伸ばす（見返し） */
  intro?: "passcode";
  /** 飛び込みの水の下に置くもの（招待状）。あれば水が下へ引いて現れる（Issue #165）。無ければ水が満ちて終わる（見返し） */
  under?: ReactNode;
  /** テスト画面だけ: 飛び込みの場面から始める（/admin/invitation_test。Issue #165 の切り替わりの確認用） */
  testDive?: { reactionMs: number };
  onReaction?: (reactionMs: number) => void;
  onFinish: (result: OpeningResult) => void;
}) {
  const [scene, setScene] = useState<Scene>(testDive ? "dive" : "call");
  const [reactionMs, setReactionMs] = useState<number | null>(testDive?.reactionMs ?? null);
  const measured = useRef<number | null>(testDive?.reactionMs ?? null);
  const finished = useRef(false);
  const handlers = useRef({ onReaction, onFinish });
  useEffect(() => {
    handlers.current = { onReaction, onFinish };
  }, [onReaction, onFinish]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const finish = useCallback((skipped: boolean) => {
    if (finished.current) return;
    finished.current = true;
    handlers.current.onFinish({ reactionMs: measured.current, skipped });
  }, []);

  const onResult = useCallback((ms: number | null) => {
    measured.current = ms;
    setReactionMs(ms);
    if (ms !== null) handlers.current.onReaction?.(ms);
    setScene("dive");
  }, []);

  if (typeof document === "undefined") return null;

  const calm = scene === "call";
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="オープニング"
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-[100] touch-none select-none overflow-hidden"
      style={{ background: calm ? OPENING_COLORS.calm : "#000", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
    >
      {scene === "call" && <CallScene date={date} venue={venue} intro={intro} onDone={() => setScene("lanes")} />}
      {scene === "lanes" && <LaneScene couple={couple} guestName={guestName} onDone={() => setScene("start")} />}
      {scene === "start" && <StartScene onResult={onResult} onSkip={() => finish(true)} />}
      {scene === "dive" && <DiveScene reactionMs={reactionMs} note={note} under={under} onDone={() => finish(false)} />}

      {/* スキップは常に右上に出す。押すと記録なしで先へ進む（すでにタイムが出ていれば、そのタイムは残る） */}
      <button
        type="button"
        onClick={() => finish(true)}
        className="absolute right-3 z-50 min-h-11 touch-manipulation rounded-full px-4 text-xs"
        style={{
          top: "calc(0.5rem + env(safe-area-inset-top))",
          color: calm ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.75)",
          background: calm ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.12)",
        }}
      >
        スキップ
      </button>
    </div>,
    document.body,
  );
}
