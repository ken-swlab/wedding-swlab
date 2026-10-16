"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { APPROVED_MESSAGE_TOP, OPENING_COLORS, OPENING_TIMING } from "@/config/opening";
import { GUIDE_PATHS } from "@/config/guide";
import { formatReaction } from "@/lib/opening-names";
import { markDarkExit } from "@/lib/screen-transition";

const MONO = "ui-monospace, Menlo, monospace";

/**
 * 承認待ち（Issue #149 で文言と見た目を改めた）。
 *
 * ★見た目は送信完了（components/opening/EntryFinish.tsx）と地続き★ 黒の地に電光掲示板の色。
 *   ただし表彰式を待つ落ち着いた時間なので動きは付けず、文字は読みやすさを優先する。
 * ★言葉は素直に「承認待ち」★ 「招集所」などの演出の言葉は使わない。
 * ★ランキングの案内はここで済ませる★ 承認後は写真の投稿を中心に案内するため。
 * 「回答を直す」は /guide/questionnaire（承認待ちでも開ける。(guest)/layout.tsx）。
 * editHref は管理者のテスト画面（/admin/invitation_test）が本番へ飛ばないように差し替える。
 *
 * ★ボタンは置かない★（Issue #156）承認されたら、呼び出し側が自動で先へ進める（hooks/useApprovalAdvance.ts）。
 *   自動で進めないとき（stale）だけ、小さなリンク「画面が切り替わらない場合はこちら」を出す。
 * ★1画面に収める★（Issue #167）幅 375px の iPhone でスクロールなしに見えるよう、出すのは
 *   見出し・本文・リアクションタイムのカード・「回答を直す」の4つだけ。同じ意味の文（自動で切り替わる・
 *   ページが開く）、ぼかしたスマホの絵、回答の要約、確認までの目安（approvalNote）は出さない。
 *   回答の中身は「回答を直す」の先で確かめられる。
 * ★表示中は html と body の背景も黒にする★（Issue #156）LINE アプリ内ブラウザで、上の帯（ページの題名）と
 *   この画面の間に、ページの地の色（白）が細い線のように見えていた。
 */
export function PendingApproval({
  reactionMs,
  approved,
  stale,
  onRetry,
  editHref = GUIDE_PATHS.questionnaire,
  onEdit,
}: {
  /**
   * オープニングのリアクションタイム (ms。Issue #131)。記録が無ければ null、読み込み中・読めなかったときは undefined（カードを出さない）
   */
  reactionMs?: number | null;
  /** 承認された（ID トークンにタグが乗るまでの、自動で先へ進む途中） */
  approved: boolean;
  /** 自動で先へ進めない（取り直しの失敗か、時間切れ）。小さなリンクを出す */
  stale: boolean;
  /** 「画面が切り替わらない場合はこちら」。ID トークンの取り直しをやり直す */
  onRetry: () => void;
  editHref?: string;
  /** 指定するとリンクの代わりにこれを呼ぶ（テスト画面） */
  onEdit?: () => void;
}) {
  useEffect(() => {
    const targets = [document.documentElement, document.body];
    const prev = targets.map((el) => el.style.backgroundColor);
    for (const el of targets) el.style.backgroundColor = "#000";
    return () => targets.forEach((el, i) => (el.style.backgroundColor = prev[i]));
  }, []);

  // ★閉じるときに印を置く★ 次の明るい画面（ゲストブック・回答の修正）が暗転から浮かび上がる（Issue #157 B-5）。
  //   承認されて閉じたときは、光が広がる形にする
  const approvedRef = useRef(approved);
  useEffect(() => {
    approvedRef.current = approved;
  }, [approved]);
  useEffect(() => () => markDarkExit(approvedRef.current ? "approved" : "dark"), []);

  const card = { borderColor: OPENING_COLORS.laneLine, background: "rgba(255,255,255,0.04)" };
  const editClass = "inline-flex min-h-11 touch-manipulation items-center text-sm underline underline-offset-4";

  return (
    <main
      className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-8 text-center"
      style={{ background: "#000", color: OPENING_COLORS.ink, paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
    >
      {/* ★承認されたら、承認待ちの文字を消してから「承認されました」を出す★（Issue #165）
          そのあとの「黒い幕が上へ開く」は、次の画面（ゲストブック）の ScreenFade（approved）が引き継ぐ。
          「承認されました」の位置と大きさは、幕（ScreenFade）の文字と同じにしておく */}
      <div
        aria-hidden={approved}
        className={`w-full max-w-[22rem] transition-opacity ease-out ${approved ? "pointer-events-none opacity-0" : "opacity-100"}`}
        style={{ transitionDuration: `${OPENING_TIMING.approvedBodyFade}ms` }}
      >
        <p className="text-[12px] tracking-[0.35em]" style={{ fontFamily: MONO, color: OPENING_COLORS.dim }}>
          EVENT 1　ENTRY
        </p>
        <h1 className="mt-5 text-2xl font-bold tracking-wide">承認待ち</h1>
        {/* ★改行は文の切れ目に手で入れる★（Issue #157 A-1。iOS の Safari は word-break: auto-phrase に未対応） */}
        <p className="mt-4 text-balance text-[15px] leading-[1.9]">
          ただいま新郎新婦が確認しています。
          <br />
          承認されると、
          <br />
          写真や思い出エピソードを
          <br />
          投稿できるようになります。
        </p>
        {reactionMs !== undefined && (
          <section aria-label="あなたのリアクションタイム" className="mt-7 rounded-2xl border px-5 py-4" style={card}>
            {reactionMs !== null ? (
              <>
                <p className="text-[13px]" style={{ color: OPENING_COLORS.ink }}>
                  あなたのリアクションタイム
                  <strong className="ml-2 text-3xl font-extrabold tabular-nums" style={{ fontFamily: MONO, color: OPENING_COLORS.led }}>
                    {formatReaction(reactionMs)}
                  </strong>
                  <span className="ml-1">秒</span>
                </p>
                <p className="mt-2 text-[12px] leading-relaxed" style={{ color: OPENING_COLORS.ink, opacity: 0.75 }}>
                  承認後、マイページのランキングで確認できます。
                </p>
              </>
            ) : (
              <p className="text-[13px] leading-relaxed">マイページから挑戦できます（承認後）</p>
            )}
          </section>
        )}
        <p className="mt-6">
          {onEdit ? (
            <button type="button" onClick={onEdit} className={editClass} style={{ color: OPENING_COLORS.ink }}>
              回答を直す
            </button>
          ) : (
            <Link href={editHref} className={editClass} style={{ color: OPENING_COLORS.ink }}>
              回答を直す
            </Link>
          )}
        </p>
      </div>

      {approved && (
        <div className="absolute inset-x-0 px-6" style={{ top: APPROVED_MESSAGE_TOP }}>
          <h1
            className="welcome-fade-in text-2xl font-bold tracking-wide"
            style={{ animationDuration: `${OPENING_TIMING.approvedMessageFade}ms`, animationDelay: `${OPENING_TIMING.approvedBodyFade}ms` }}
          >
            承認されました
          </h1>
          {stale && (
            <p className="mt-6">
              <button type="button" onClick={onRetry} className={editClass} style={{ color: OPENING_COLORS.ink }}>
                画面が切り替わらない場合はこちら
              </button>
            </p>
          )}
        </div>
      )}
    </main>
  );
}
