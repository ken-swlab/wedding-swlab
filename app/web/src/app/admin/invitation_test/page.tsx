"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGuestSession } from "@/hooks/useGuestSession";
import { InvitationFlow, type InvitationStep } from "@/components/guestbook/InvitationFlow";
import { OnboardingForm, type OnboardingAnswer } from "@/components/guestbook/OnboardingForm";
import { PendingApproval, pendingAnswerSummary } from "@/components/guestbook/PendingApproval";
import type { AnswerDraft } from "@/components/guestbook/AnswerFields";
import { useApprovalAdvance } from "@/hooks/useApprovalAdvance";
import { WelcomeMoment } from "@/components/guestbook/WelcomeMoment";
import { WelcomeCard, WelcomePinned } from "@/components/guestbook/WelcomeCard";
import { WELCOME_DEFAULT_MESSAGE } from "@/config/welcome";
import type { WelcomeContent } from "@/types/welcome";
import { SAMPLE_INVITATION } from "@/config/wedding";
import { OPENING_NOTE } from "@/config/invitation";
import { classifyDisplayName } from "@/lib/opening-names";
import { getJson } from "@/lib/api-client";
import type { InvitationConfig, InvitationStatus } from "@/types/invitation";

/**
 * 中身は「本番の値」と「見本」を切り替えられる。
 *
 * ★本番の値はコードに書かず、開いたときに GET /api/guest/invitation から受け取る★
 *   本物は Firestore の config/invitation にだけあり、リポジトリにもクライアントのバンドルにも入れない
 *   （管理者はパスコードを通った扱いなので、ゲストと同じ API で受け取れる）。
 *   未設定・読めないときは見本に切り替える。見本は架空の中身（src/config/invitation-sample.json）。
 */
type Source = "live" | "sample";
type LiveState = { kind: "loading" } | { kind: "ready"; config: InvitationConfig } | { kind: "unavailable"; message: string };

/** ダミーのパスコード判定でわざと間違いにする値。エラー表示の確認用 */
const WRONG_PASSCODE = "0000";

/** オープニングと出欠フォームに出す LINE の表示名（ダミー）の初期値。画面で書き換えて、名前の表記合わせを試せる */
const DUMMY_DISPLAY_NAME = "高橋 太郎";

/**
 * 回答フォームに最初から入れておくダミーの回答（Issue #156）。開いてすぐ「送信する」を押せる。書き換えも試せる。
 * ★架空の値だけ★ 名前は LINE 名のダミー（DUMMY_DISPLAY_NAME）にそろえる。本番の回答フォームには渡さない。
 */
const DUMMY_ANSWER: AnswerDraft = {
  lastName: "高橋",
  firstName: "太郎",
  lastKana: "たかはし",
  firstKana: "たろう",
  attendance: "both",
  ceremony: "ceremony",
  drinkLevel: 2,
  carFare: false,
  hasAllergy: false,
  allergy: "",
  note: "",
};

/**
 * テスト画面の段階。招待状の段階に、本番では別の画面（/pending）になる承認待ちを足したもの。
 * approval: 「承認されたことにする」を押したか。stuck なら、自動の取り直しを 1 回だけ失敗させる
 *   （「画面が切り替わらない場合はこちら」を確かめるため）。
 */
type TestApproval = null | { stuck: boolean };
type TestStep = InvitationStep | { kind: "pending"; approval: TestApproval } | { kind: "welcome"; run: number };

/** 承認待ちに出すダミーのリアクションタイム (ms) */
const DUMMY_REACTION_MS = 210;

const STEP_LABEL: Record<TestStep["kind"], string> = {
  entrance: "1-2. 入り口・LINE ログイン",
  loading: "読み込み中",
  passcode: "3. パスコード",
  opening: "4. オープニング",
  preparing: "準備中",
  open: "5. 招待状・出欠の回答",
  finish: "6. 送信完了",
  pending: "7. 承認待ち",
  welcome: "8. 承認後の演出",
  error: "エラー",
};

/**
 * 招待状の画面遷移を試す管理者用のページ。
 *
 * ★LINE ログイン・保存をしない★ 呼ぶ API は中身を受け取る GET /api/guest/invitation だけ。
 *   InvitationFlow にダミーの処理を渡し、押すと console.log して次の段階へ進めるだけ。
 *   本番の登録状態に関係なく、何度でも最初から通せる。
 */
export default function InvitationTestPage() {
  const { user, isAdmin, loading } = useGuestSession();
  const [step, setStep] = useState<TestStep>({ kind: "entrance", busy: false, message: null });
  const [note, setNote] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(DUMMY_DISPLAY_NAME);
  const [source, setSource] = useState<Source>("live");
  const [live, setLive] = useState<LiveState>({ kind: "loading" });
  const [liveAttempt, setLiveAttempt] = useState(0);

  // 本番の値を受け取る。サーバーは最大60秒キャッシュするので、set の直後は古いことがある
  useEffect(() => {
    if (!user || !isAdmin) return;
    let cancelled = false;
    getJson<InvitationStatus>("/api/guest/invitation")
      .then((s) => {
        if (cancelled) return;
        if (s.ready && s.invitation && s.opening) setLive({ kind: "ready", config: { ...s.invitation, opening: s.opening } });
        else setLive({ kind: "unavailable", message: "本番の config/invitation が未設定か、形が違います" });
      })
      .catch((e: unknown) => {
        if (!cancelled) setLive({ kind: "unavailable", message: e instanceof Error ? e.message : "読み込みに失敗しました" });
      });
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, liveAttempt]);

  const config = source === "live" && live.kind === "ready" ? live.config : SAMPLE_INVITATION;
  const [currentOpening, currentInvitation] = useMemo(() => {
    const { opening, ...invitation } = config;
    return [opening, invitation] as const;
  }, [config]);

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
    setStep({ kind: "opening", opening: currentOpening, displayName, note: OPENING_NOTE.test });
  }, [currentOpening, displayName]);

  // ★記録しない★ /api/guest/reaction を呼ばない。タイムは画面と console に出すだけ
  const onOpeningEnd = useCallback((result: { reactionMs: number | null; skipped: boolean }) => {
    console.log("[invitation_test] オープニングが終了", result);
    setStep({ kind: "open", invitation: currentInvitation });
  }, [currentInvitation]);

  // ★回答の中身（本名・アレルギー）をログに出さない★ ダミーでも本物を入れて試すことがあるため
  const onRsvpSubmit = useCallback(async (answer: OnboardingAnswer) => {
    console.log("[invitation_test] 出欠の回答を送信（ダミー）", answer.attendance);
    await new Promise((r) => setTimeout(r, 400));
    window.scrollTo({ top: 0 });
    setStep({ kind: "finish", guestName: classifyDisplayName(displayName).guest });
  }, [displayName]);

  /** 上部の段階表示から直接開く（6・7） */
  const jump = useCallback((kind: "finish" | "pending" | "welcome") => {
    setNote(null);
    if (kind === "finish") setStep({ kind, guestName: classifyDisplayName(displayName).guest });
    else if (kind === "welcome") setStep({ kind, run: Date.now() });
    else setStep({ kind, approval: null });
  }, [displayName]);

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
        オープニング（全画面の fixed）の間はオープニングに隠れる。
      */}
      <aside className="border-b border-stone-200 bg-white px-3 pb-3 text-[12px] text-stone-600" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-stone-400 hover:text-stone-700">← 管理</Link>
          <span className="flex-1 truncate font-medium text-stone-800">テスト: {STEP_LABEL[step.kind]}</span>
          <button type="button" onClick={restart} className="min-h-9 touch-manipulation rounded-full bg-stone-900 px-3 text-white hover:bg-stone-700">
            最初から
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="shrink-0">直接開く:</span>
          {(["finish", "pending", "welcome"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => jump(k)}
              aria-pressed={step.kind === k}
              className={`min-h-9 touch-manipulation rounded-full px-3 ${step.kind === k ? "bg-stone-900 text-white" : "border border-stone-200 text-stone-700 hover:bg-stone-100"}`}
            >
              {STEP_LABEL[k]}
            </button>
          ))}
        </div>
        {step.kind === "pending" && step.approval === null && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStep({ kind: "pending", approval: { stuck: false } })}
              className="min-h-9 touch-manipulation rounded-full bg-emerald-700 px-3 text-white hover:bg-emerald-800"
            >
              承認されたことにする
            </button>
            <button
              type="button"
              onClick={() => setStep({ kind: "pending", approval: { stuck: true } })}
              className="min-h-9 touch-manipulation rounded-full border border-emerald-700 px-3 text-emerald-800 hover:bg-emerald-50"
            >
              承認されたことにする（自動で進めない場合）
            </button>
          </div>
        )}
        <p className="mt-1.5 leading-relaxed text-stone-500">
          ログイン・保存はしません。パスコードは {WRONG_PASSCODE} で失敗、それ以外は成功します。下へスクロールするとこのパネルが消え、ゲストと同じ画面になります。
        </p>
        <label className="mt-1.5 flex items-center gap-2">
          <span className="shrink-0">LINE 名:</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            aria-label="LINE の表示名（ダミー）"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-stone-200 px-2 text-base text-stone-800"
          />
        </label>
        <p className="mt-1 text-stone-500">
          オープニングの名前の表記: {classifyDisplayName(displayName).style}
          {classifyDisplayName(displayName).matched ? "" : "（判定できないので既定）"}。パスコードを通るとオープニングが流れます（記録はしません）。
        </p>
        <div role="tablist" aria-label="招待状の中身" className="mt-1.5 flex items-center gap-1.5">
          <span className="shrink-0">中身:</span>
          {(["live", "sample"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={source === s}
              onClick={() => {
                setSource(s);
                restart();
              }}
              className={`min-h-9 touch-manipulation rounded-full px-3 ${source === s ? "bg-stone-900 text-white" : "border border-stone-200 text-stone-700 hover:bg-stone-100"}`}
            >
              {s === "live" ? "本番の値" : "見本"}
            </button>
          ))}
          {source === "live" && (
            <button
              type="button"
              onClick={() => {
                setLive({ kind: "loading" });
                setLiveAttempt((n) => n + 1);
                restart();
              }}
              className="min-h-9 touch-manipulation rounded-full border border-stone-200 px-3 text-stone-700 hover:bg-stone-100"
            >
              読み直す
            </button>
          )}
        </div>
        {source === "live" && live.kind === "loading" && <p className="mt-1 text-stone-500">本番の値を読み込んでいます…</p>}
        {source === "live" && live.kind === "ready" && (
          <p className="mt-1 text-stone-500">本番の config/invitation を表示しています。set の直後は、反映まで最大1分かかります（「読み直す」）。</p>
        )}
        {source === "live" && live.kind === "unavailable" && (
          <p role="alert" className="mt-1 rounded-xl bg-amber-50 px-3 py-2 text-amber-800">{live.message}。見本を表示しています。</p>
        )}
        {note && <p className="mt-1.5 rounded-xl bg-sky-50 px-3 py-2 text-sky-800">{note}</p>}
      </aside>

      {/* 本番の /invitation と同じ組み合わせ（開催概要の下に OnboardingForm） */}
      {step.kind === "welcome" ? (
        // ★welcomeSeenAt を書かない・いいねも保存しない★ 何度でも最初から見られる（key で作り直す）
        <WelcomeTestStage key={step.run} />
      ) : step.kind === "pending" ? (
        <TestPending
          // 承認の押し方を変えたら作り直す（自動の流れを最初から見る）
          key={step.approval === null ? "waiting" : step.approval.stuck ? "stuck" : "approved"}
          approval={step.approval}
          approvalNote={currentInvitation.approvalNote ?? null}
          onApproved={() => jump("welcome")}
          onEdit={() => {
            console.log("[invitation_test] 回答を直す（ダミー）");
            setNote("本番は /guide/questionnaire（回答の修正）を開きます");
            window.scrollTo({ top: 0 });
          }}
        />
      ) : (
        <InvitationFlow
          step={step}
          onLogin={onLogin}
          onPasscodeSubmit={onPasscodeSubmit}
          onOpeningEnd={onOpeningEnd}
          rsvp={
            <OnboardingForm
              displayName={displayName}
              ceremony={currentInvitation.ceremony}
              initialDraft={DUMMY_ANSWER}
              onSubmit={onRsvpSubmit}
            />
          }
          onRetry={restart}
          onEntryNext={() => {
            console.log("[invitation_test] 送信完了 → 承認待ち");
            setStep({ kind: "pending", approval: null });
          }}
        />
      )}
    </>
  );
}

/** テストの「トークンの取り直し」にかける時間 (ms)。本番の取り直しに近い間を置く */
const DUMMY_REFRESH_MS = 800;

/**
 * 7. 承認待ち。本番の /pending と同じ部品と、同じ自動の流れ（useApprovalAdvance）。
 * ★取り直しはダミー★ 何も読み書きしない。成功したら 8. 承認後の演出へ進む（本番は layout が /guestbook へ移す）。
 *   stuck なら 1 回目は失敗させ、「画面が切り替わらない場合はこちら」を出す。押すと 2 回目で成功する。
 */
function TestPending({
  approval,
  approvalNote,
  onApproved,
  onEdit,
}: {
  approval: TestApproval;
  approvalNote: string | null;
  onApproved: () => void;
  onEdit: () => void;
}) {
  const failNext = useRef(approval?.stuck === true);
  const refresh = useCallback(async () => {
    console.log("[invitation_test] 承認後のトークンの取り直し（ダミー）");
    await new Promise((r) => setTimeout(r, DUMMY_REFRESH_MS));
    if (failNext.current) {
      failNext.current = false;
      throw new Error("ダミーの失敗（自動で進めない場合の確認）");
    }
    onApproved();
  }, [onApproved]);
  const { stale, retry } = useApprovalAdvance({ approved: approval !== null, refresh });
  return (
    <PendingApproval
      reactionMs={DUMMY_REACTION_MS}
      approved={approval !== null}
      stale={stale}
      onRetry={retry}
      onEdit={onEdit}
      approvalNote={approvalNote}
      answerSummary={pendingAnswerSummary(DUMMY_ANSWER.attendance, DUMMY_ANSWER.ceremony)}
    />
  );
}

/** テスト画面の演出に使う仮の投稿（仮の画像。いいねは保存しない） */
const TEST_WELCOME: WelcomeContent = { postId: null, message: WELCOME_DEFAULT_MESSAGE, media: null, reactionCount: 0, authorPhotoURL: null };

/**
 * 8. 承認後の演出（Issue #150）を、ゲストブックに似せた背景の上で流す。
 * ★本物のタイムラインは読まない★ 背景はダミーのカードと＋ボタン（data-welcome-plus）だけ。
 */
function WelcomeTestStage() {
  const [running, setRunning] = useState(true);
  const [pin, setPin] = useState<{ hidden: boolean } | null>(null);
  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
          <p className="flex-1 font-serif text-xl text-stone-900">GB</p>
          <span
            data-welcome-plus=""
            className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-900 text-2xl leading-none text-white"
            aria-label="新しく投稿する（ダミー）"
          >
            <span aria-hidden>＋</span>
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 pb-24 pt-4">
        <div className="h-24 rounded-2xl border border-stone-200/80 bg-white shadow-sm" aria-hidden />
        {pin && <WelcomePinned content={TEST_WELCOME} hidden={pin.hidden} />}
        {[0, 1].map((i) => (
          <div key={i} className="opacity-60" aria-hidden>
            <WelcomeCard content={{ ...TEST_WELCOME, message: "（ダミー）ほかのゲストの投稿" }} liked={false} />
          </div>
        ))}
      </main>
      {running && (
        <WelcomeMoment
          content={TEST_WELCOME}
          onPin={() => setPin({ hidden: true })}
          onReveal={() => setPin((p) => (p ? { hidden: false } : p))}
          onDone={(r) => {
            console.log("[invitation_test] 承認後の演出が終了", r);
            setRunning(false);
            if (!r.liked) setPin(null);
          }}
        />
      )}
    </div>
  );
}
