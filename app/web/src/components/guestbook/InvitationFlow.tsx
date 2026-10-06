"use client";

import { useEffect, useRef } from "react";
import { PasscodeStep } from "@/components/guestbook/PasscodeStep";
import { InvitationView } from "@/components/guestbook/InvitationView";
import { SplashScreen } from "@/components/SplashScreen";
import { TEASER_FALLBACK_SEC, TEASER_MAX_SEC } from "@/config/invitation";
import type { InvitationContent } from "@/types/invitation";

/**
 * 招待状の画面の段階。親（/invitation・/admin/invitation_test）が持ち、ここは見た目だけを描く。
 *   entrance … 入り口と LINE ログイン（個人の情報なし）
 *   passcode … パスコード入力（個人の情報なし）
 *   teaser   … パスコードを通った直後のティザー動画（全画面）
 *   open     … 招待状の本文と出欠の回答
 */
export type InvitationStep =
  | { kind: "entrance"; busy: boolean; message: string | null }
  | { kind: "loading" }
  | { kind: "passcode" }
  | { kind: "teaser" }
  | { kind: "open"; invitation: InvitationContent }
  | { kind: "error"; message: string };

export type InvitationFlowProps = {
  step: InvitationStep;
  /** 「LINE でログイン」 */
  onLogin: () => void;
  /** パスコードの送信。通らなければ Error を投げる（message を画面に出す） */
  onPasscodeSubmit: (passcode: string) => Promise<void>;
  /** ティザー動画が終わった・スキップされた */
  onTeaserEnd: () => void;
  /** 「出欠を回答する」 */
  onRsvp: () => void;
  /** エラー画面の「もう一度読み込む」 */
  onRetry: () => void;
  /** ティザー動画の URL（同一オリジン・blob: か R2）。無ければ代わりの画面を出す */
  teaserSrc?: string;
};

/**
 * 招待状の見た目。ログイン・API・画面遷移は持たず、すべて props で受け取る。
 *
 * ★entrance と passcode の段階に新郎新婦の名前・写真・会場を出さない★
 *   招待状の URL は外に出回る前提。名前などは open の invitation（API がパスコードを
 *   通った人にだけ返す）からだけ描く。ここに定数として書かない。
 */
export function InvitationFlow({ step, onLogin, onPasscodeSubmit, onTeaserEnd, onRsvp, onRetry, teaserSrc }: InvitationFlowProps) {
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
    case "teaser":
      return <TeaserStep src={teaserSrc} onDone={onTeaserEnd} />;
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
          <div className="mx-auto w-full max-w-[26rem] px-6 pb-36 pt-12">
            <InvitationView invitation={step.invitation} />
          </div>
          <div className="fixed inset-x-0 bottom-0 border-t border-stone-200/80 bg-[#faf9f7]/95 backdrop-blur" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="mx-auto w-full max-w-[26rem] px-6 pt-4">
              <button type="button" onClick={onRsvp} className="flex h-14 w-full touch-manipulation items-center justify-center rounded-2xl bg-stone-900 text-[15px] font-medium text-white shadow-sm transition hover:bg-stone-700 active:brightness-95">
                出欠を回答する
              </button>
            </div>
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

/**
 * パスコードを通った直後に全画面で流すティザー動画。終わったら onDone。
 *
 * ★autoPlay には muted と playsInline を必ず付ける★
 *   付けないと iOS Safari・LINE 内ブラウザが自動再生せず、全画面プレーヤーに切り替わる。
 * ★動画が終わらなくても必ず先へ進める★
 *   省電力モードの iOS は muted でも自動再生を止める。読み込みに失敗することもある。
 *   上限の秒数で進め、再生できないと分かったらすぐ短い秒数に切り替える。スキップも置く。
 */
function TeaserStep({ src, onDone }: { src?: string; onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    onDoneRef.current();
  }

  function startTimer(sec: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(finish, sec * 1000);
  }

  useEffect(() => {
    doneRef.current = false;
    startTimer(src ? TEASER_MAX_SEC : TEASER_FALLBACK_SEC);
    // autoPlay が効かなかったとき（省電力モードなど）は play() が reject する
    videoRef.current?.play().catch(() => startTimer(TEASER_FALLBACK_SEC));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- src が変わったときだけ数え直す
  }, [src]);

  return (
    <main className="fixed inset-0 bg-black text-white">
      {src ? (
        <video
          ref={videoRef}
          key={src}
          src={src}
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={finish}
          onError={() => startTimer(TEASER_FALLBACK_SEC)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="invitation-rise flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-stone-900 to-stone-700 text-center">
          <p className="text-[11px] tracking-[0.35em] text-stone-400">TEASER</p>
          <p className="mt-3 font-serif text-lg text-stone-100">（ここにティザー動画が流れます）</p>
        </div>
      )}
      <button
        type="button"
        onClick={finish}
        className="absolute right-4 min-h-11 touch-manipulation rounded-full bg-white/15 px-4 text-[13px] text-white backdrop-blur"
        style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        スキップ
      </button>
    </main>
  );
}
