"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiffAuth } from "@/hooks/useLiffAuth";
import { getJson, postJson } from "@/lib/api-client";
import { InvitationFlow, type InvitationStep } from "@/components/guestbook/InvitationFlow";
import { OnboardingForm } from "@/components/guestbook/OnboardingForm";
import type { InvitationContent, InvitationStatus } from "@/types/invitation";

type View =
  | { kind: "checking" }
  | { kind: "passcode" }
  | { kind: "open"; invitation: InvitationContent }
  | { kind: "error"; message: string };

/**
 * 招待状。未ログイン → LINE ログイン → パスコード → 招待状と出欠の回答（同じページの開催概要の下）。
 *
 * ★ログインしてパスコードを通るまで、新郎新婦の名前・写真・会場を出さない★
 *   中身はこのファイルにもバンドルにも無く、GET /api/guest/invitation が
 *   パスコードを通った人にだけ返す。未ログインの画面に足すときも個人の情報を置かない。
 *
 * 見た目は InvitationFlow（/admin/invitation_test と共通）。ここはログインと API だけを持つ。
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
    router.prefetch("/guestbook");
  }, [router]);

  const passcodeSubmit = useCallback(
    async (passcode: string) => {
      await postJson("/api/guest/passcode", { passcode });
      reload();
    },
    [reload],
  );

  // ★本番はティザー動画を挟まない★ パスコードを通ったら招待状をそのまま開く（動画は /admin/invitation_test で調整中）
  let step: InvitationStep;
  if (phase === "booting") step = { kind: "loading" };
  else if (!user) {
    const busy = phase === "liff-init" || phase === "line-login" || phase === "exchanging";
    step = { kind: "entrance", busy, message };
  } else if (view.kind === "checking") step = { kind: "loading" };
  else step = view;

  return (
    <InvitationFlow
      step={step}
      onLogin={login}
      onPasscodeSubmit={passcodeSubmit}
      onTeaserEnd={reload}
      rsvp={
        <OnboardingForm
          displayName={user?.displayName}
          onSubmit={async (answer) => {
            await postJson("/api/guest/register", answer);
            // 承認待ちなら (guest)/layout が /pending に振り分ける（/onboarding と同じ）
            router.replace("/guestbook");
          }}
        />
      }
      onRetry={reload}
    />
  );
}
