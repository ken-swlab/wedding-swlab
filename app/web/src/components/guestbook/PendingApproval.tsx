"use client";

import Link from "next/link";
import { useEffect } from "react";
import { OPENING_COLORS } from "@/config/opening";
import { GUIDE_PATHS } from "@/config/guide";
import { formatReaction } from "@/lib/opening-names";

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

  const card = { borderColor: OPENING_COLORS.laneLine, background: "rgba(255,255,255,0.04)" };
  const editClass = "inline-flex min-h-11 touch-manipulation items-center text-sm underline underline-offset-4";

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center"
      style={{ background: "#000", color: OPENING_COLORS.ink, paddingBottom: "max(3rem, env(safe-area-inset-bottom))" }}
    >
      <div className="w-full max-w-[22rem]">
        <p className="text-[12px] tracking-[0.35em]" style={{ fontFamily: MONO, color: OPENING_COLORS.dim }}>
          EVENT 1　ENTRY
        </p>

        {approved ? (
          <>
            <h1 className="mt-5 text-2xl font-bold tracking-wide">承認されました</h1>
            <p className="mt-4 text-[15px] leading-[1.9]" style={{ color: OPENING_COLORS.ink }}>
              まもなくゲストブックが開きます。
            </p>
            {stale && (
              <p className="mt-6">
                <button type="button" onClick={onRetry} className={editClass} style={{ color: OPENING_COLORS.ink }}>
                  画面が切り替わらない場合はこちら
                </button>
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="mt-5 text-2xl font-bold tracking-wide">承認待ち</h1>
            <p className="mt-4 text-[15px] leading-[1.9]">
              ただいま新郎新婦が確認しています。
              <br />
              承認されると、写真や思い出エピソードを投稿できるようになります。
            </p>

            {reactionMs !== undefined && (
              <section aria-label="あなたのリアクションタイム" className="mt-8 rounded-2xl border px-5 py-4" style={card}>
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
          </>
        )}

        {!approved && (
          <p className="mt-8">
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
        )}
      </div>
    </main>
  );
}
