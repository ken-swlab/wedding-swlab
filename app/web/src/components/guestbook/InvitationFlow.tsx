"use client";

import type { ReactNode } from "react";
import { PasscodeStep } from "@/components/guestbook/PasscodeStep";
import { InvitationView } from "@/components/guestbook/InvitationView";
import { SplashScreen } from "@/components/SplashScreen";
import { Opening, type OpeningResult } from "@/components/opening/Opening";
import { openingCast } from "@/lib/opening-names";
import type { InvitationContent, OpeningContent } from "@/types/invitation";

/**
 * 招待状の画面の段階。親（/invitation・/admin/invitation_test）が持ち、ここは見た目だけを描く。
 *   entrance … 入り口と LINE ログイン（個人の情報なし）
 *   passcode … パスコード入力（個人の情報なし）
 *   opening  … パスコードを通った直後のオープニング演出「招集」（全画面。Issue #131）
 *   open     … 招待状の本文と、その下に出欠の回答フォーム（1ページの縦スクロール。Issue #74）
 *   preparing … 招待状の中身がまだ用意できていない（config/invitation が未設定）
 */
export type InvitationStep =
  | { kind: "entrance"; busy: boolean; message: string | null }
  | { kind: "loading" }
  | { kind: "passcode" }
  | { kind: "opening"; opening: OpeningContent; displayName: string | null | undefined; note: string }
  | { kind: "preparing" }
  | { kind: "open"; invitation: InvitationContent }
  | { kind: "error"; message: string };

export type InvitationFlowProps = {
  step: InvitationStep;
  /** 「LINE でログイン」 */
  onLogin: () => void;
  /** パスコードの送信。通らなければ Error を投げる（message を画面に出す） */
  onPasscodeSubmit: (passcode: string) => Promise<void>;
  /** オープニングで有効なリアクションタイムが出た（保存するかは親が決める） */
  onOpeningReaction?: (reactionMs: number) => void;
  /** オープニングが終わった・スキップされた */
  onOpeningEnd: (result: OpeningResult) => void;
  /** open の段階で開催概要の下に出す出欠の回答フォーム（送信の処理は親が持つ） */
  rsvp: ReactNode;
  /** エラー画面・準備中の画面の「もう一度読み込む」 */
  onRetry: () => void;
};

/**
 * 招待状の見た目。ログイン・API・画面遷移は持たず、すべて props で受け取る。
 *
 * ★entrance と passcode の段階に新郎新婦の名前・写真・会場を出さない★
 *   招待状の URL は外に出回る前提。名前などは open の invitation と opening の opening（API がパスコードを
 *   通った人にだけ返す）からだけ描く。ここに定数として書かない。
 */
export function InvitationFlow({ step, onLogin, onPasscodeSubmit, onOpeningReaction, onOpeningEnd, rsvp, onRetry }: InvitationFlowProps) {
  switch (step.kind) {
    case "loading":
      return <SplashScreen phase="booting" />;
    case "entrance":
      return <EntranceStep busy={step.busy} message={step.message} onLogin={onLogin} />;
    case "passcode":
      return (
        <main className="min-h-dvh bg-[#faf9f7] text-stone-800">
          <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-6 py-10">
            <PasscodeStep onSubmit={onPasscodeSubmit} />
          </div>
        </main>
      );
    case "opening": {
      // 新郎新婦の表記は、ゲストの LINE 名の書き方に合わせる（lib/opening-names.ts）
      const cast = openingCast(step.displayName, step.opening.names);
      return (
        <Opening
          couple={cast.couple}
          guestName={cast.guestName}
          date={step.opening.date}
          venue={step.opening.venue}
          note={step.note}
          onReaction={onOpeningReaction}
          onFinish={onOpeningEnd}
        />
      );
    }
    case "preparing":
      return (
        <main className="min-h-dvh bg-[#faf9f7] text-stone-800">
          <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col items-center justify-center px-6 text-center">
            <p className="font-serif text-lg text-stone-800">ただいま準備中です</p>
            <p className="mt-3 text-[13.5px] leading-[1.9] text-stone-500">
              招待状を準備しています。
              <br />
              お手数ですが、しばらくしてからもう一度お試しください。
            </p>
            <button type="button" onClick={onRetry} className="mt-6 min-h-11 touch-manipulation rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700">
              もう一度読み込む
            </button>
          </div>
        </main>
      );
    case "error":
      return (
        <main className="min-h-dvh bg-[#faf9f7] text-stone-800">
          <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col items-center justify-center px-6 text-center">
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] leading-relaxed text-rose-700">{step.message}</p>
            <button type="button" onClick={onRetry} className="mt-5 min-h-11 touch-manipulation rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700">
              もう一度読み込む
            </button>
          </div>
        </main>
      );
    case "open":
      return (
        <main className="min-h-dvh bg-[#faf9f7] text-stone-800">
          <div className="mx-auto w-full max-w-[26rem] px-6 pt-12" style={{ paddingBottom: "max(3rem, env(safe-area-inset-bottom))" }}>
            <InvitationView invitation={step.invitation} />
            <section aria-label="出欠のご回答" className="mt-8">
              {rsvp}
            </section>
          </div>
        </main>
      );
  }
}

function EntranceStep({ busy, message, onLogin }: { busy: boolean; message: string | null; onLogin: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col bg-[#faf9f7] px-6 text-stone-800" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
      <div className="invitation-rise mx-auto flex w-full max-w-[24rem] flex-1 flex-col items-center justify-center text-center">
        <svg viewBox="0 0 48 48" className="h-12 w-12 text-stone-300" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="6" y="11" width="36" height="26" rx="3" />
          <path d="M7 13l17 13 17-13" />
        </svg>
        <p className="mt-6 text-[11px] tracking-[0.35em] text-stone-400">INVITATION</p>
        <h1 className="mt-3 font-serif text-xl text-stone-800">招待状が届いています</h1>
        <p className="mt-4 text-[13.5px] leading-[1.9] text-stone-500">
          招待状をご覧いただくには
          <br />
          LINE でログインしてください。
        </p>
      </div>
      <div className="mx-auto w-full max-w-[24rem]">
        {message && <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-[12px] leading-relaxed text-rose-700">{message}</p>}
        <button type="button" onClick={onLogin} disabled={busy} className="flex h-14 w-full touch-manipulation items-center justify-center gap-2.5 rounded-2xl bg-[#06C755] text-[15px] font-medium text-white shadow-sm transition active:brightness-95 disabled:opacity-60">
          {busy ? "LINE に接続しています…" : "LINE でログイン"}
        </button>
      </div>
    </main>
  );
}
