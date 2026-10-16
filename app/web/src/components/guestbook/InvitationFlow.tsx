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
import { ProgramStrip } from "@/components/guestbook/ProgramList";
import { ENTRY_BAR_DELAY_MS, INVITATION_COLORS } from "@/config/invitation";
import { OPENING_COLORS, OPENING_TIMING } from "@/config/opening";
import type { InvitationContent, OpeningContent } from "@/types/invitation";

/**
 * 招待状の画面の段階。親（/invitation・/admin/invitation_test）が持ち、ここは見た目だけを描く。
 *   entrance … 入り口と LINE ログイン（個人の情報なし）
 *   passcode … パスコード入力（個人の情報なし）
 *   opening  … パスコードを通った直後のオープニング演出「招集」（全画面。Issue #131）
 *   open     … 招待状の本文。画面下の「エントリーする」で、出欠の回答フォーム（エントリー画面）に切り替わる（Issue #166）
 *   preparing … 招待状の中身がまだ用意できていない（config/invitation が未設定）
 *   finish   … 初めて回答を送った直後の「エントリー完了」（全画面。Issue #149）。3 秒かタップで承認待ちへ（Issue #156）
 */
export type InvitationStep =
  | { kind: "entrance"; busy: boolean; message: string | null }
  | { kind: "loading" }
  | { kind: "passcode" }
  | {
      kind: "opening";
      opening: OpeningContent;
      displayName: string | null | undefined;
      note: string;
      /** 招待状の中身。あれば飛び込みの水の下に置き、水が引くと現れる（Issue #165） */
      invitation?: InvitationContent;
      /** テスト画面だけ: 飛び込みの場面から始める（そのときのタイム） */
      testDive?: { reactionMs: number };
    }
  | { kind: "preparing" }
  | { kind: "open"; invitation: InvitationContent; opening: OpeningContent }
  | { kind: "finish"; guestName: string }
  | { kind: "error"; message: string };

export type InvitationFlowProps = {
  step: InvitationStep;
  /** 「LINE でログイン」 */
  onLogin: () => void;
  /**
   * パスコードの送信。通らなければ Error を投げる（message を画面に出す）。
   * ★通ったら、次の画面の中身まで読み込んでから resolve する★ 画面はまだ切り替えない（枠が線になる演出の途中）。
   */
  onPasscodeSubmit: (passcode: string) => Promise<void>;
  /** パスコードを通り、枠が線になる演出が終わった。ここで次の画面（オープニング）へ切り替える（Issue #165） */
  onPasscodeCleared: () => void;
  /** オープニングで有効なリアクションタイムが出た（保存するかは親が決める） */
  onOpeningReaction?: (reactionMs: number) => void;
  /** オープニングが終わった・スキップされた */
  onOpeningEnd: (result: OpeningResult) => void;
  /** open の段階のエントリー画面に出す出欠の回答フォーム（送信の処理は親が持つ） */
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
export function InvitationFlow({ step, onLogin, onPasscodeSubmit, onPasscodeCleared, onOpeningReaction, onOpeningEnd, rsvp, onRetry, onEntryNext }: InvitationFlowProps) {
  // ひとつ前の段階を覚えておき、切り替わりの演出を選ぶ（Issue #157 B-5・#165）
  //   passcode → opening … 枠が縮んだ線から「招集」を始める（CallScene の intro）
  //   opening → open    … 水が引いて現れた招待状をそのまま出す。スキップしたときだけ暗転から浮かび上がらせる
  const [prev, setPrev] = useState({ kind: step.kind, from: step.kind });
  if (prev.kind !== step.kind) setPrev({ kind: step.kind, from: prev.kind });
  const [openingSkipped, setOpeningSkipped] = useState(false);
  const reveal: InvitationReveal = step.kind === "open" && prev.from === "opening" ? (openingSkipped ? "skipped" : "dive") : null;

  switch (step.kind) {
    case "loading":
      return <SplashScreen phase="booting" />;
    case "entrance":
      return <EntranceStep busy={step.busy} message={step.message} onLogin={onLogin} />;
    case "passcode":
      return (
        // ★地の色は招集と同じ★（Issue #165。パスコード → 招集で地の色を変えない）
        <main className="min-h-dvh text-stone-800" style={{ background: OPENING_COLORS.calm }}>
          <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-6 py-10">
            <PasscodeStep onSubmit={onPasscodeSubmit} onCleared={onPasscodeCleared} />
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
          intro={prev.from === "passcode" ? "passcode" : undefined}
          under={step.invitation && <InvitationUnderWater invitation={step.invitation} opening={step.opening} />}
          testDive={step.testDive}
          onReaction={onOpeningReaction}
          onFinish={(result) => {
            setOpeningSkipped(result.skipped);
            onOpeningEnd(result);
          }}
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
      return <InvitationOpen invitation={step.invitation} opening={step.opening} reveal={reveal} rsvp={rsvp} />;
  }
}

/**
 * 招待状（読む場所）とエントリー画面（判断する場所）。画面を分ける（Issue #166）。
 *   招待状 … InvitationView。表示されてから ENTRY_BAR_DELAY_MS 後に、画面下の「エントリーする」を下からふわっと出す。
 *   エントリー画面 … 上部に当日の流れ（ProgramStrip）を固定し、その下に出欠の回答フォーム。
 * ★回答フォームは招待状に戻っても消さない★ hidden で隠すだけにして、入力中の内容を残す。
 * ★切り替えたら一番上へ★ 招待状の下のほうから移っても、フォームの最初（1/4 お名前）から見せる。
 */
function InvitationOpen({
  invitation,
  opening,
  reveal,
  rsvp,
}: {
  invitation: InvitationContent;
  opening: OpeningContent;
  reveal: InvitationReveal;
  rsvp: ReactNode;
}) {
  const [entry, setEntry] = useState(false);
  const [barOn, setBarOn] = useState(false);
  // 水が引いて現れたときは、引ききってから entryBarAfterReveal 後に出す（Issue #165）
  const [barDelay] = useState(() => (prefersReducedMotion() ? 0 : reveal === "dive" ? OPENING_TIMING.entryBarAfterReveal : ENTRY_BAR_DELAY_MS));
  useEffect(() => {
    const t = setTimeout(() => setBarOn(true), barDelay);
    return () => clearTimeout(t);
  }, [barDelay]);

  const go = (next: boolean) => {
    setEntry(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <main className="min-h-dvh text-stone-800" style={{ background: INVITATION_COLORS.paper }}>
      <ScreenFade from={reveal === "skipped" ? "dark" : null} />
      <div hidden={entry} className="mx-auto w-full max-w-[26rem]" style={{ paddingBottom: "calc(8rem + env(safe-area-inset-bottom))" }}>
        {/* ★水が引いて現れたときは、ふわっと出す動きを繰り返さない★ 水の下の招待状（InvitationUnderWater）がもう出しきっている */}
        <InvitationView invitation={invitation} opening={opening} rise={reveal !== "dive"} />
      </div>
      {!entry && (
        <div
          className={`fixed inset-x-0 bottom-0 z-20 px-[18px] pt-3 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${
            barOn ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-5 opacity-0"
          }`}
          style={{
            paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
            background: `linear-gradient(180deg, ${INVITATION_COLORS.paper}00, ${INVITATION_COLORS.paper} 35%)`,
          }}
        >
          <button
            type="button"
            onClick={() => go(true)}
            tabIndex={barOn ? 0 : -1}
            className="mx-auto block min-h-12 w-full max-w-[26rem] touch-manipulation rounded-full bg-stone-900 px-6 py-3.5 text-[15px] font-bold tracking-[0.05em] text-white hover:bg-stone-700"
          >
            エントリーする（出欠のご回答）
          </button>
        </div>
      )}
      <div hidden={!entry} className={entry ? "invitation-entry-lift" : ""}>
        <ProgramStrip
          program={invitation.program}
          date={opening.date}
          venue={opening.venue}
          className="top-0"
          style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
          action={
            <button type="button" onClick={() => go(false)} className="min-h-9 shrink-0 touch-manipulation rounded-full border border-stone-200 bg-white px-3 text-[11px] text-stone-500">
              招待状を見る
            </button>
          }
        />
        <div className="mx-auto w-full max-w-[26rem] px-4 pt-5" style={{ paddingBottom: "max(3rem, env(safe-area-inset-bottom))" }}>
          {rsvp}
        </div>
      </div>
    </main>
  );
}

/** 招待状がどう現れたか。dive … 飛び込みの水が引いて現れた ／ skipped … オープニングをスキップした ／ null … それ以外 */
type InvitationReveal = "dive" | "skipped" | null;

/**
 * 飛び込みの水の下に置く招待状（Issue #165）。★見た目は InvitationOpen の招待状と同じ★
 *   水が引ききったら InvitationOpen に入れ替わる。同じ部品・同じ幅・同じ地の色で、ページの一番上なので、
 *   入れ替わっても見た目は変わらない（画面下の「エントリーする」だけが、そのあと出てくる）。
 */
function InvitationUnderWater({ invitation, opening }: { invitation: InvitationContent; opening: OpeningContent }) {
  return (
    <div className="absolute inset-0 overflow-hidden text-stone-800" style={{ background: INVITATION_COLORS.paper }}>
      <div className="mx-auto w-full max-w-[26rem]">
        <InvitationView invitation={invitation} opening={opening} />
      </div>
    </div>
  );
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
    <main className="flex min-h-dvh flex-col justify-center px-6 text-stone-800" style={{ background: OPENING_COLORS.calm, paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
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
