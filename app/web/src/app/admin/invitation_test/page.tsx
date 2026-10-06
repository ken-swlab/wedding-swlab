"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useGuestSession } from "@/hooks/useGuestSession";
import { InvitationFlow, type InvitationStep } from "@/components/guestbook/InvitationFlow";
import { GuestShell } from "@/components/guestbook/GuestShell";
import { OnboardingForm, type OnboardingAnswer } from "@/components/guestbook/OnboardingForm";
import type { InvitationContent } from "@/types/invitation";

/**
 * ★本物の名前・会場を使わない★
 *   本物は src/config/wedding.ts（サーバー専用）にあり、クライアントのバンドルに入れない。
 *   ここは見た目の確認用の架空の中身。
 */
const DUMMY_INVITATION: InvitationContent = {
  groom: "新郎 太郎",
  bride: "新婦 花子",
  dateLabel: "20XX年X月X日（土）",
  receptionAt: "受付 XX:XX ／ 披露宴 XX:XX",
  venueName: "（ダミー）会場名",
  venueAddress: "（ダミー）住所",
  venueMapUrl: "",
  greeting: ["（ダミー）ご挨拶の一行目です。", "（ダミー）ご挨拶の二行目です。"],
};

/** ダミーのパスコード判定でわざと間違いにする値。エラー表示の確認用 */
const WRONG_PASSCODE = "0000";

/** 出欠フォームの下に出す LINE の表示名（ダミー） */
const DUMMY_DISPLAY_NAME = "LINE の表示名";

/** InvitationFlow の段階に、本番では別ページ（/onboarding）の出欠回答を足したもの */
type TestStep = InvitationStep | { kind: "rsvp" };

const STEP_LABEL: Record<TestStep["kind"], string> = {
  entrance: "1-2. 入り口・LINE ログイン",
  loading: "読み込み中",
  passcode: "3. パスコード",
  teaser: "4. ティザー動画",
  open: "5. 招待状・出欠",
  error: "エラー",
  rsvp: "6. 出欠回答（/onboarding）",
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
  const [step, setStep] = useState<TestStep>({ kind: "entrance", busy: false, message: null });
  const [note, setNote] = useState<string | null>(null);
  const [teaserSrc, setTeaserSrc] = useState<string | undefined>(undefined);

  // 選んだ動画は端末の中だけで再生する（blob: URL）。どこにもアップロードしない
  useEffect(() => {
    return () => {
      if (teaserSrc) URL.revokeObjectURL(teaserSrc);
    };
  }, [teaserSrc]);

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
    setStep({ kind: "teaser" });
  }, []);

  const onTeaserEnd = useCallback(() => {
    console.log("[invitation_test] ティザー動画が終了");
    setStep({ kind: "open", invitation: DUMMY_INVITATION });
  }, []);

  const onRsvp = useCallback(() => {
    console.log("[invitation_test] 出欠を回答する（ダミー）");
    setNote(null);
    setStep({ kind: "rsvp" });
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
        ティザー動画（全画面の fixed）の間は動画に隠れる。
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
          <span className="shrink-0">動画:</span>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setTeaserSrc(file ? URL.createObjectURL(file) : undefined);
            }}
            className="min-w-0 flex-1 text-[11px]"
          />
        </label>
        {note && <p className="mt-1.5 rounded-xl bg-sky-50 px-3 py-2 text-sky-800">{note}</p>}
      </aside>

      {step.kind === "rsvp" ? (
        // 本番の /onboarding と同じ組み合わせ（GuestShell + OnboardingForm）
        <GuestShell>
          <OnboardingForm displayName={DUMMY_DISPLAY_NAME} onSubmit={onRsvpSubmit} />
        </GuestShell>
      ) : (
        <InvitationFlow
          step={step}
          onLogin={onLogin}
          onPasscodeSubmit={onPasscodeSubmit}
          onTeaserEnd={onTeaserEnd}
          onRsvp={onRsvp}
          onRetry={restart}
          teaserSrc={teaserSrc}
        />
      )}
    </>
  );
}
