"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiffAuth } from "@/hooks/useLiffAuth";
import { getJson } from "@/lib/api-client";
import { SplashScreen } from "@/components/SplashScreen";
import { PasscodeStep } from "@/components/guestbook/PasscodeStep";
import { InvitationView } from "@/components/guestbook/InvitationView";
import type { InvitationContent, InvitationStatus } from "@/types/invitation";

type View =
  | { kind: "checking" }
  | { kind: "passcode" }
  | { kind: "open"; invitation: InvitationContent }
  | { kind: "error"; message: string };

/**
 * 招待状。未ログイン → LINE ログイン → パスコード → 招待状 → 出欠の回答（/onboarding）。
 *
 * ★ログインしてパスコードを通るまで、新郎新婦の名前・写真・会場を出さない★
 *   中身はこのファイルにもバンドルにも無く、GET /api/guest/invitation が
 *   パスコードを通った人にだけ返す。未ログインの画面に足すときも個人の情報を置かない。
 */
export default function InvitationPage() {
  const router = useRouter();
  const { phase, user, message, login } = useLiffAuth(false);
  const [view, setView] = useState<View>({ kind: "checking" });

  // 何度目の読み込みか。パスコード通過後や「もう一度読み込む」で増やして取り直す
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getJson<InvitationStatus>("/api/guest/invitation")
      .then((s) => {
        if (cancelled) return;
        // 登録済みの人はこれまでどおりゲストブックへ（承認待ちなら layout が /pending に振り分ける）
        if (s.registered) router.replace("/guestbook");
        else if (s.cleared && s.invitation) setView({ kind: "open", invitation: s.invitation });
        else setView({ kind: "passcode" });
      })
      .catch((e: unknown) => {
        if (!cancelled) setView({ kind: "error", message: e instanceof Error ? e.message : "読み込みに失敗しました" });
      });
    return () => {
      cancelled = true;
    };
  }, [user, attempt, router]);

  const reload = useCallback(() => {
    setView({ kind: "checking" });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    router.prefetch("/onboarding");
  }, [router]);

  if (phase === "booting") return <SplashScreen phase="booting" />;

  if (!user) {
    const busy = phase === "liff-init" || phase === "line-login" || phase === "exchanging";
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
          <button type="button" onClick={login} disabled={busy} className="flex h-14 w-full touch-manipulation items-center justify-center gap-2.5 rounded-2xl bg-[#06C755] text-[15px] font-medium text-white shadow-sm transition active:brightness-95 disabled:opacity-60">
            {busy ? "LINE に接続しています…" : "LINE でログイン"}
          </button>
        </div>
      </main>
    );
  }

  if (view.kind === "checking") return <SplashScreen phase="booting" />;

  return (
    <main className="min-h-dvh bg-[#faf9f7] text-stone-800">
      {view.kind === "passcode" && (
        <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-6 py-10">
          <PasscodeStep onCleared={reload} />
        </div>
      )}

      {view.kind === "error" && (
        <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col items-center justify-center px-6 text-center">
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] leading-relaxed text-rose-700">{view.message}</p>
          <button type="button" onClick={reload} className="mt-5 min-h-11 touch-manipulation rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700">
            もう一度読み込む
          </button>
        </div>
      )}

      {view.kind === "open" && (
        <>
          <div className="mx-auto w-full max-w-[26rem] px-6 pb-36 pt-12">
            <InvitationView invitation={view.invitation} />
          </div>
          <div className="fixed inset-x-0 bottom-0 border-t border-stone-200/80 bg-[#faf9f7]/95 backdrop-blur" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="mx-auto w-full max-w-[26rem] px-6 pt-4">
              <button type="button" onClick={() => router.push("/onboarding")} className="flex h-14 w-full touch-manipulation items-center justify-center rounded-2xl bg-stone-900 text-[15px] font-medium text-white shadow-sm transition hover:bg-stone-700 active:brightness-95">
                出欠を回答する
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
