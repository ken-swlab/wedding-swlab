"use client";

import type { LiffPhase } from "@/hooks/useLiffAuth";

const CAPTION: Record<LiffPhase, string> = {
  booting: "読み込んでいます",
  "liff-init": "LINE に接続しています",
  "line-login": "LINE に移動しています",
  exchanging: "ログインしています",
  ready: "ゲストブックを開いています",
  error: "接続できませんでした",
};

/**
 * LINE 内ブラウザはリロードのたびに白画面を挟むため、
 * 初期化のあいだ一貫してこの画面を出し続けて「待たされ感」を消す。
 */
export function SplashScreen({
  phase,
  message,
  onRetry,
}: {
  phase: LiffPhase;
  message?: string | null;
  onRetry?: () => void;
}) {
  const failed = phase === "error";

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-stone-50 px-8">
      <div className="flex w-full max-w-xs flex-col items-center text-center">
        {failed ? (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-2xl">
            !
          </div>
        ) : (
          <div
            aria-hidden
            className="h-10 w-10 animate-spin rounded-full border-2 border-stone-200 border-t-stone-800"
          />
        )}

        <h1 className="mt-8 font-serif text-xl tracking-[0.2em] text-stone-800">
          GUEST BOOK
        </h1>
        <div
          className="mx-auto mt-3 h-px w-10 bg-stone-300"
          aria-hidden
        />

        <p
          aria-live="polite"
          className={`mt-4 text-sm ${failed ? "text-rose-700" : "text-stone-400"}`}
        >
          {CAPTION[phase]}
        </p>

        {failed && message && (
          <p className="mt-3 text-xs leading-relaxed text-stone-500">{message}</p>
        )}

        {failed && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
          >
            もう一度試す
          </button>
        )}
      </div>
    </main>
  );
}
