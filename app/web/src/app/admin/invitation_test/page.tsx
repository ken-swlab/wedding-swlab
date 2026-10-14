"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useGuestSession } from "@/hooks/useGuestSession";
import { InvitationFlow, type InvitationStep } from "@/components/guestbook/InvitationFlow";
import { OnboardingForm, type OnboardingAnswer } from "@/components/guestbook/OnboardingForm";
import { SAMPLE_INVITATION } from "@/config/wedding";
import { OPENING_NOTE } from "@/config/invitation";
import { classifyDisplayName } from "@/lib/opening-names";

/**
 * ★本物の名前・会場を使わない★
 *   本物は Firestore の config/invitation にあり、クライアントのバンドルにもリポジトリにも入れない。
 *   ここは見た目の確認用の架空の中身（src/config/invitation-sample.json）。
 */
const { opening: DUMMY_OPENING, ...DUMMY_INVITATION } = SAMPLE_INVITATION;

/** ダミーのパスコード判定でわざと間違いにする値。エラー表示の確認用 */
const WRONG_PASSCODE = "0000";

/** オープニングと出欠フォームに出す LINE の表示名（ダミー）の初期値。画面で書き換えて、名前の表記合わせを試せる */
const DUMMY_DISPLAY_NAME = "高橋 太郎";

const STEP_LABEL: Record<InvitationStep["kind"], string> = {
  entrance: "1-2. 入り口・LINE ログイン",
  loading: "読み込み中",
  passcode: "3. パスコード",
  opening: "4. オープニング",
  preparing: "準備中",
  open: "5. 招待状・出欠の回答",
  error: "エラー",
};

/**
 * 招待状の画面遷移を試す管理者用のページ。
 *
 * ★LINE ログイン・API・Firestore を呼ばない★
 *   InvitationFlow にダミーの処理を渡し、押すと console.log して次の段階へ進めるだけ。
 *   本番の登録状態に関係なく、何度でも最初から通せる。
 */
export default function InvitationTestPage() {
  const { user, isAdmin, loading } = useGuestSession();
  const [step, setStep] = useState<InvitationStep>({ kind: "entrance", busy: false, message: null });
  const [note, setNote] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(DUMMY_DISPLAY_NAME);

  const restart = useCallback(() => {
    console.log("[invitation_test] 最初から");
    setNote(null);
    setStep({ kind: "entrance", busy: false, message: null });
  }, []);

  const onLogin = useCallback(() => {
    console.log("[invitation_test] LINE でログイン（ダミー）");
    setStep({ kind: "passcode" });
  }, []);

  const onPasscodeSubmit = useCallback(async (passcode: string) => {
    console.log("[invitation_test] パスコード送信（ダミー）", passcode.length, "桁");
    await new Promise((r) => setTimeout(r, 400));
    if (passcode === WRONG_PASSCODE) throw new Error("パスコードが違います（ダミーのエラーです）");
    setStep({ kind: "opening", opening: DUMMY_OPENING, displayName, note: OPENING_NOTE.test });
  }, [displayName]);

  // ★記録しない★ /api/guest/reaction を呼ばない。タイムは画面と console に出すだけ
  const onOpeningEnd = useCallback((result: { reactionMs: number | null; skipped: boolean }) => {
    console.log("[invitation_test] オープニングが終了", result);
    setStep({ kind: "open", invitation: DUMMY_INVITATION });
  }, []);

  // ★回答の中身（本名・アレルギー）をログに出さない★ ダミーでも本物を入れて試すことがあるため
  const onRsvpSubmit = useCallback(async (answer: OnboardingAnswer) => {
    console.log("[invitation_test] 出欠の回答を送信（ダミー）", answer.attendance);
    await new Promise((r) => setTimeout(r, 400));
    setNote("送信しました（ダミー）。本番はここでゲストブック（承認待ちなら /pending）へ進みます");
    window.scrollTo({ top: 0 });
  }, []);

  if (loading) {
    return <main className="min-h-screen bg-stone-50 p-8"><div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" /></main>;
  }
  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8">
        <p className="text-sm text-stone-600">管理者専用ページです</p>
      </main>
    );
  }

  return (
    <>
      {/*
        テスト用の操作パネル。★fixed にせずページの先頭に置く★
        下へスクロールすれば消え、その下はゲストが見る画面とまったく同じになる。
        オープニング（全画面の fixed）の間はオープニングに隠れる。
      */}
      <aside className="border-b border-stone-200 bg-white px-3 pb-3 text-[12px] text-stone-600" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-stone-400 hover:text-stone-700">← 管理</Link>
          <span className="flex-1 truncate font-medium text-stone-800">テスト: {STEP_LABEL[step.kind]}</span>
          <button type="button" onClick={restart} className="min-h-9 touch-manipulation rounded-full bg-stone-900 px-3 text-white hover:bg-stone-700">
            最初から
          </button>
        </div>
        <p className="mt-1.5 leading-relaxed text-stone-500">
          ダミーです（ログイン・保存はしません）。パスコードは {WRONG_PASSCODE} で失敗、それ以外は成功します。下へスクロールするとこのパネルが消え、ゲストと同じ画面になります。
        </p>
        <label className="mt-1.5 flex items-center gap-2">
          <span className="shrink-0">LINE 名:</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            aria-label="LINE の表示名（ダミー）"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-stone-200 px-2 text-base text-stone-800"
          />
        </label>
        <p className="mt-1 text-stone-500">
          オープニングの名前の表記: {classifyDisplayName(displayName).style}
          {classifyDisplayName(displayName).matched ? "" : "（判定できないので既定）"}。パスコードを通るとオープニングが流れます（記録はしません）。
        </p>
        {note && <p className="mt-1.5 rounded-xl bg-sky-50 px-3 py-2 text-sky-800">{note}</p>}
      </aside>

      {/* 本番の /invitation と同じ組み合わせ（開催概要の下に OnboardingForm） */}
      <InvitationFlow
        step={step}
        onLogin={onLogin}
        onPasscodeSubmit={onPasscodeSubmit}
        onOpeningEnd={onOpeningEnd}
        rsvp={<OnboardingForm displayName={displayName} onSubmit={onRsvpSubmit} />}
        onRetry={restart}
      />
    </>
  );
}
