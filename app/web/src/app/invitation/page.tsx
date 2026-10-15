"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiffAuth } from "@/hooks/useLiffAuth";
import { getJson, postJson } from "@/lib/api-client";
import { InvitationFlow, type InvitationStep } from "@/components/guestbook/InvitationFlow";
import { OnboardingForm } from "@/components/guestbook/OnboardingForm";
import { OPENING_NOTE } from "@/config/invitation";
import { hasSeenOpening, markOpeningSeen } from "@/lib/opening-seen";
import type { InvitationContent, InvitationStatus, OpeningContent, ReactionStatus } from "@/types/invitation";

type View =
  | { kind: "checking" }
  | { kind: "passcode" }
  /** recorded: すでにリアクションタイムの記録があるか（あれば今回は記録しない） */
  | { kind: "opening"; invitation: InvitationContent; opening: OpeningContent; recorded: boolean }
  | { kind: "open"; invitation: InvitationContent }
  | { kind: "preparing" }
  | { kind: "error"; message: string };

/**
 * 招待状。未ログイン → LINE ログイン → パスコード → オープニング → 招待状と出欠の回答（同じページの開催概要の下）。
 *
 * ★ログインしてパスコードを通るまで、新郎新婦の名前・写真・会場を出さない★
 *   中身はこのファイルにもバンドルにも無く、GET /api/guest/invitation が
 *   パスコードを通った人にだけ返す。未ログインの画面に足すときも個人の情報を置かない。
 *
 * ★オープニング（Issue #131）は初回だけ自動で流す★ 見たかどうかは端末に覚える（lib/opening-seen.ts）。
 *   2回目以降はそのまま招待状を開く。見返しはマイページから。
 * ★リアクションタイムの記録は最初の有効な1回だけ★ サーバー（/api/guest/reaction）が上書きを断る。
 *   すでに記録がある人には、今回は記録しないことを画面に出す。
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
      .then(async (s) => {
        if (cancelled) return;
        // 登録済みの人はこれまでどおりゲストブックへ（承認待ちなら layout が /pending に振り分ける）
        if (s.registered) router.replace("/guestbook");
        else if (!s.cleared) setView({ kind: "passcode" });
        else if (!s.ready || !s.invitation) setView({ kind: "preparing" });
        else if (s.opening && !hasSeenOpening()) {
          // 記録の有無は、オープニングの前に確かめておく（読めなければ「記録なし」として進める。上書きはサーバーが断る）
          const reaction = await getJson<ReactionStatus>("/api/guest/reaction").catch(() => null);
          if (!cancelled) setView({ kind: "opening", invitation: s.invitation, opening: s.opening, recorded: reaction?.reactionMs != null });
        } else setView({ kind: "open", invitation: s.invitation });
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

  let step: InvitationStep;
  if (phase === "booting") step = { kind: "loading" };
  else if (!user) {
    const busy = phase === "liff-init" || phase === "line-login" || phase === "exchanging";
    step = { kind: "entrance", busy, message };
  } else if (view.kind === "checking") step = { kind: "loading" };
  else if (view.kind === "opening") {
    step = { kind: "opening", opening: view.opening, displayName: user.displayName, note: view.recorded ? OPENING_NOTE.replay : OPENING_NOTE.recordPending };
  } else step = view;

  return (
    <InvitationFlow
      step={step}
      onLogin={login}
      onPasscodeSubmit={passcodeSubmit}
      onOpeningReaction={(reactionMs) => {
        if (view.kind !== "opening" || view.recorded) return;
        // 保存は演出を止めずに行う。失敗しても先へ進める（記録が無い人は、あとでマイページから挑戦できる）
        postJson("/api/guest/reaction", { reactionMs }).catch((e: unknown) => console.error("[invitation] リアクションタイムの保存に失敗しました", e));
      }}
      onOpeningEnd={() => {
        markOpeningSeen();
        if (view.kind === "opening") setView({ kind: "open", invitation: view.invitation });
      }}
      rsvp={
        <OnboardingForm
          displayName={user?.displayName}
          ceremony={view.kind === "open" ? view.invitation.ceremony : null}
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
