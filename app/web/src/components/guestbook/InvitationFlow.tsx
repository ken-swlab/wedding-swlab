"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PasscodeStep } from "@/components/guestbook/PasscodeStep";
import { InvitationView } from "@/components/guestbook/InvitationView";
import { SplashScreen } from "@/components/SplashScreen";
import { Opening, type OpeningResult } from "@/components/opening/Opening";
import { EntryFinish } from "@/components/opening/EntryFinish";
import { openingCast } from "@/lib/opening-names";
import { prefersReducedMotion } from "@/components/opening/timeline";
import { ScreenFade } from "@/components/ScreenFade";
import type { InvitationContent, OpeningContent } from "@/types/invitation";

/**
 * 招待状の画面の段階。親（/invitation・/admin/invitation_test）が持ち、ここは見た目だけを描く。
 *   entrance … 入り口と LINE ログイン（個人の情報なし）
 *   passcode … パスコード入力（個人の情報なし）
 *   opening  … パスコードを通った直後のオープニング演出「招集」（全画面。Issue #131）
 *   open     … 招待状の本文と、その下に出欠の回答フォーム（1ページの縦スクロール。Issue #74）
 *   preparing … 招待状の中身がまだ用意できていない（config/invitation が未設定）
 *   finish   … 初めて回答を送った直後の「エントリー完了」（全画面。Issue #149）。3 秒かタップで承認待ちへ（Issue #156）
 */
export type InvitationStep =
  | { kind: "entrance"; busy: boolean; message: string | null }
  | { kind: "loading" }
  | { kind: "passcode" }
  | { kind: "opening"; opening: OpeningContent; displayName: string | null | undefined; note: string }
  | { kind: "preparing" }
  | { kind: "open"; invitation: InvitationContent }
  | { kind: "finish"; guestName: string }
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
  /** 送信完了（finish）から承認待ちへ進む（自動・タップ。Issue #156） */
  onEntryNext?: () => void;
};

/**
 * 招待状の見た目。ログイン・API・画面遷移は持たず、すべて props で受け取る。
 *
 * ★entrance と passcode の段階に新郎新婦の名前・写真・会場を出さない★
 *   招待状の URL は外に出回る前提。名前などは open の invitation と opening の opening（API がパスコードを
 *   通った人にだけ返す）からだけ描く。ここに定数として書かない。
 */
export function InvitationFlow({ step, onLogin, onPasscodeSubmit, onOpeningReaction, onOpeningEnd, rsvp, onRetry, onEntryNext }: InvitationFlowProps) {
  // ★オープニング（黒）から招待状（明るい）へは、暗転から浮かび上がらせる★（Issue #157 B-5）
  //   ひとつ前の段階を覚えておき、opening → open のときだけ ScreenFade を出す
  const [prev, setPrev] = useState({ kind: step.kind, from: step.kind });
  if (prev.kind !== step.kind) setPrev({ kind: step.kind, from: prev.kind });
  const fromOpening = step.kind === "open" && prev.from === "opening";

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
    case "finish":
      return <EntryFinish guestName={step.guestName} onNext={() => onEntryNext?.()} />;
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
          <ScreenFade from={fromOpening ? "dark" : null} />
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

/** 封を開ける動きの長さ (ms)。ログインを始める前に見せきる（Issue #157 B-1） */
const ENVELOPE_OPEN_MS = 450;

/**
 * 入り口（Issue #157 B-1）。封筒を大きく出し、「LINE でログイン」は本文のすぐ下（画面の中ほど）に置く。
 * ★封を開けてからログインを始める★ ボタンか封筒を押すと、封筒のふたが開き（ENVELOPE_OPEN_MS）、そのあと onLogin。
 *   動きを減らす設定では待たずに onLogin。
 * ★ここに新郎新婦の名前・日付・会場を出さない★（CLAUDE.md ルール 4a。上の★参照）
 */
function EntranceStep({ busy, message, onLogin }: { busy: boolean; message: string | null; onLogin: () => void }) {
  const [opening, setOpening] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const open = () => {
    if (busy || opening) return;
    setOpening(true);
    if (prefersReducedMotion()) {
      onLogin();
      return;
    }
    timer.current = setTimeout(() => {
      onLogin();
      // 戻ってきたとき（ログインを取りやめた・失敗した）は、また押せるようにする
      setOpening(false);
    }, ENVELOPE_OPEN_MS);
  };
  const isOpen = opening || busy;

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-[#faf9f7] px-6 text-stone-800" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
      <div className="invitation-rise mx-auto flex w-full max-w-[24rem] flex-col items-center text-center">
        <button type="button" onClick={open} disabled={busy} aria-label="招待状を開く（LINE でログイン）" className="touch-manipulation rounded-2xl p-2">
          <Envelope open={isOpen} />
        </button>
        <p className="mt-6 text-[11px] tracking-[0.35em] text-stone-500">INVITATION</p>
        <h1 className="mt-3 font-serif text-xl text-stone-800">招待状が届いています</h1>
        <p className="mt-4 text-[13.5px] leading-[1.9] text-stone-600">
          招待状をご覧いただくには
          <br />
          LINE でログインしてください。
        </p>

        <div className="mt-8 w-full">
          {message && <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-[12px] leading-relaxed text-rose-700">{message}</p>}
          <button type="button" onClick={open} disabled={busy} className="flex h-14 w-full touch-manipulation items-center justify-center gap-2.5 rounded-2xl bg-[#06C755] text-[15px] font-medium text-white shadow-sm transition active:brightness-95 disabled:opacity-60">
            {busy ? "LINE に接続しています…" : "LINE でログイン"}
          </button>
          {/* ★ポリシーのリンクは、ポリシーを公開するときに足す★（いまは未承認の草案。オーナーの判断） */}
          <p className="mt-3 text-[12px] leading-relaxed text-stone-500">ログインには、LINE のお名前とアイコンを使います。</p>
        </div>
      </div>
    </main>
  );
}

/**
 * 封筒の絵。open でふたが上へ開く。
 * ★ふたは scaleY で裏返す★ SVG の 3D 回転（rotateX）は iOS の Safari で崩れることがあるため。
 *   transform-box: fill-box で、ふたの上端（封筒の縁）を軸にする。
 */
function Envelope({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 64 56" className="h-24 w-24 overflow-visible text-stone-400" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="18" width="52" height="34" rx="3" className="fill-white" />
      <path d="M7 50l19-16M57 50L38 34" opacity="0.6" />
      <path
        d="M6 19 L32 38 L58 19 Z"
        className="fill-stone-100 transition-transform ease-out motion-reduce:transition-none"
        style={{
          transformBox: "fill-box",
          transformOrigin: "50% 0%",
          transform: open ? "scaleY(-1)" : "scaleY(1)",
          transitionDuration: `${ENVELOPE_OPEN_MS}ms`,
        }}
      />
    </svg>
  );
}
