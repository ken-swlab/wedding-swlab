"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useGuestSession } from "@/hooks/useGuestSession";
import { InvitationFlow, type InvitationStep } from "@/components/guestbook/InvitationFlow";
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

const STEP_LABEL: Record<InvitationStep["kind"], string> = {
  entrance: "1-2. 入り口・LINE ログイン",
  loading: "読み込み中",
  passcode: "3. パスコード",
  teaser: "4. ティザー動画",
  open: "5. 招待状・出欠",
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
    setNote("本番はここで出欠の回答（/onboarding）へ進みます");
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
      <InvitationFlow
        step={step}
        onLogin={onLogin}
        onPasscodeSubmit={onPasscodeSubmit}
        onTeaserEnd={onTeaserEnd}
        onRsvp={onRsvp}
        onRetry={restart}
        teaserSrc={teaserSrc}
      />

      {/* テスト用の操作パネル。招待状の上に重ねる */}
      <aside
        className="fixed inset-x-2 z-50 rounded-2xl border border-stone-200/80 bg-white/90 p-3 text-[12px] text-stone-600 shadow-sm backdrop-blur"
        style={{ top: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-stone-400 hover:text-stone-700">← 管理</Link>
          <span className="flex-1 truncate font-medium text-stone-800">テスト: {STEP_LABEL[step.kind]}</span>
          <button type="button" onClick={restart} className="min-h-9 touch-manipulation rounded-full bg-stone-900 px-3 text-white hover:bg-stone-700">
            最初から
          </button>
        </div>
        <p className="mt-1.5 leading-relaxed text-stone-500">
          ダミーです（ログイン・保存はしません）。パスコードは {WRONG_PASSCODE} で失敗、それ以外は成功します。
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
    </>
  );
}
