"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiffAuth } from "@/hooks/useLiffAuth";
import { getJson, postJson } from "@/lib/api-client";
import { InvitationFlow, type InvitationStep } from "@/components/guestbook/InvitationFlow";
import { OnboardingForm } from "@/components/guestbook/OnboardingForm";
import { OPENING_NOTE } from "@/config/invitation";
import { hasSeenOpening, markOpeningSeen } from "@/lib/opening-seen";
import { classifyDisplayName } from "@/lib/opening-names";
import type { InvitationContent, InvitationStatus, OpeningContent, ReactionStatus } from "@/types/invitation";

type View =
  | { kind: "checking" }
  | { kind: "passcode" }
  /** recorded: すでにリアクションタイムの記録があるか（あれば今回は記録しない） */
  | { kind: "opening"; invitation: InvitationContent; opening: OpeningContent; recorded: boolean }
  | { kind: "open"; invitation: InvitationContent; opening: OpeningContent }
  /** 初めて回答を送った直後のエントリー完了（Issue #149） */
  | { kind: "finish"; guestName: string }
  | { kind: "preparing" }
  | { kind: "error"; message: string };

/**
 * 招待状。未ログイン → LINE ログイン → パスコード → オープニング → 招待状 →「エントリーする」で出欠の回答（Issue #166）。
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
    loadView()
      .then((next) => {
        if (cancelled) return;
        // 登録済みの人はこれまでどおりゲストブックへ（承認待ちなら layout が /pending に振り分ける）
        if (next === "registered") router.replace("/guestbook");
        else setView(next);
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

  // ★パスコードを通ったら、次の画面の中身を読み込んでから resolve する★（Issue #165）
  //   画面の切り替えは、枠が線になる演出が終わったあと（passcodeCleared）。読み込み中の画面を挟まない
  const afterPasscode = useRef<View | "registered" | null>(null);
  const passcodeSubmit = useCallback(async (passcode: string) => {
    await postJson("/api/guest/passcode", { passcode });
    afterPasscode.current = await loadView().catch(() => null);
  }, []);
  const passcodeCleared = useCallback(() => {
    const next = afterPasscode.current;
    afterPasscode.current = null;
    if (next === "registered") router.replace("/guestbook");
    else if (next) setView(next);
    else reload();
  }, [reload, router]);

  let step: InvitationStep;
  if (phase === "booting") step = { kind: "loading" };
  else if (!user) {
    const busy = phase === "liff-init" || phase === "line-login" || phase === "exchanging";
    step = { kind: "entrance", busy, message };
  } else if (view.kind === "checking") step = { kind: "loading" };
  else if (view.kind === "opening") {
    step = {
      kind: "opening",
      opening: view.opening,
      invitation: view.invitation,
      displayName: user.displayName,
      note: view.recorded ? OPENING_NOTE.replay : OPENING_NOTE.recordPending,
    };
  } else step = view;

  return (
    <InvitationFlow
      step={step}
      onLogin={login}
      onPasscodeSubmit={passcodeSubmit}
      onPasscodeCleared={passcodeCleared}
      onOpeningReaction={(reactionMs) => {
        if (view.kind !== "opening" || view.recorded) return;
        // 保存は演出を止めずに行う。失敗しても先へ進める（記録が無い人は、あとでマイページから挑戦できる）
        postJson("/api/guest/reaction", { reactionMs }).catch((e: unknown) => console.error("[invitation] リアクションタイムの保存に失敗しました", e));
      }}
      onOpeningEnd={() => {
        markOpeningSeen();
        if (view.kind === "opening") setView({ kind: "open", invitation: view.invitation, opening: view.opening });
      }}
      rsvp={
        <OnboardingForm
          displayName={user?.displayName}
          program={view.kind === "open" ? view.invitation.program : null}
          onSubmit={async (answer) => {
            await postJson("/api/guest/register", answer);
            // ★ここは初回の送信だけ★（登録済みの人は開いた時点でゲストブックへ移る）。エントリー完了を出し、
            //   3 秒かタップで承認待ちへ（(guest)/layout が /pending に振り分ける。Issue #149・#156）
            window.scrollTo({ top: 0 });
            setView({ kind: "finish", guestName: classifyDisplayName(user?.displayName).guest });
          }}
        />
      }
      onRetry={reload}
      onEntryNext={() => router.replace("/guestbook")}
    />
  );
}

/**
 * 招待状の状態を読み、次に出す画面を決める。登録済みなら "registered"（呼び出し側がゲストブックへ移す）。
 * ★オープニングを見る人は、記録の有無もここで確かめる★（読めなければ「記録なし」として進める。上書きはサーバーが断る）
 */
async function loadView(): Promise<View | "registered"> {
  const s = await getJson<InvitationStatus>("/api/guest/invitation");
  if (s.registered) return "registered";
  if (!s.cleared) return { kind: "passcode" };
  if (!s.ready || !s.invitation || !s.opening) return { kind: "preparing" };
  if (hasSeenOpening()) return { kind: "open", invitation: s.invitation, opening: s.opening };
  const reaction = await getJson<ReactionStatus>("/api/guest/reaction").catch(() => null);
  return { kind: "opening", invitation: s.invitation, opening: s.opening, recorded: reaction?.reactionMs != null };
}
