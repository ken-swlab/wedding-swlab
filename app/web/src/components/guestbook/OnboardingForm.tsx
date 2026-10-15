"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  AnswerFields,
  EMPTY_ANSWER_DRAFT,
  Section,
  answerDraftMissing,
  answerPayload,
  scrollToAnswerField,
  type AnswerDraft,
} from "@/components/guestbook/AnswerFields";
import { PROFILE_NICKNAME_MAX } from "@/config/profile";
import type { CeremonyInfo } from "@/types/invitation";

/** 出欠の回答。POST /api/guest/register の本文 */
export type OnboardingAnswer = ReturnType<typeof answerPayload> & {
  /** 空欄ならサーバーが既定名（ゲスト0000 の形）を付ける */
  nickname: string;
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2.5 text-base text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:bg-white";

/**
 * 出欠の回答フォーム。送信の処理（API の呼び出しと送信後の遷移）は onSubmit で受け取る。
 * 通らなければ Error を投げ、その message を画面に出す（/admin/invitation_test はダミーを渡す）。
 * 招待状（/invitation の開催概要の下）と /onboarding で使う。
 */
export function OnboardingForm({
  displayName,
  initialNickname,
  ceremony,
  initialDraft,
  onSubmit: submit,
}: {
  /** LINE の表示名。フォームの下に「〜として回答します」と出す（★ニックネームの既定値には使わない★） */
  displayName?: string | null;
  initialNickname?: string;
  /** 挙式の時刻と案内文（config/invitation）。無ければ時刻なしで聞く */
  ceremony?: CeremonyInfo | null;
  /**
   * 入力欄の初期値（Issue #156）。★管理者のテスト画面（/admin/invitation_test）のダミーの回答だけが渡す★
   * 本番の招待状は渡さない（空欄から始める）。
   */
  initialDraft?: AnswerDraft;
  onSubmit: (answer: OnboardingAnswer) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AnswerDraft>(initialDraft ?? EMPTY_ANSWER_DRAFT);
  const [nickname, setNickname] = useState(initialNickname || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 送信を押したあとだけ、足りない項目に案内を出す（開いた直後から赤くしない）
  const [tried, setTried] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const missing = answerDraftMissing(draft);
  const ready = missing.length === 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!ready) {
      setTried(true);
      scrollToAnswerField(formRef.current, missing[0]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submit({ ...answerPayload(draft), nickname: nickname.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    // ★noValidate★ ブラウザの「入力してください」の吹き出しではなく、足りない項目の案内を出す（Issue #157 A-3）
    <form ref={formRef} onSubmit={onSubmit} noValidate className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-8 text-center">
        <h2 className="font-serif text-lg text-stone-900">ご出席のご確認</h2>
        {/* ★改行は文の切れ目に手で入れる★（Issue #157 A-1。iOS の Safari は word-break: auto-phrase に未対応） */}
        <p className="mt-2 text-balance text-sm leading-relaxed text-stone-500">
          ご回答のあと、新郎新婦が確認すると
          <br />
          「ゲストブック」が開きます。
        </p>
        {/* ゲストブックで何ができるかを具体的に（Issue #157 B-2） */}
        <p className="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-left text-[12.5px] leading-relaxed text-stone-600">
          ゲストブックは、この日のための、ゲスト限定のページです。写真を投稿したり、ほかのゲストの写真を見たりできます。
        </p>
      </div>

      <AnswerFields
        value={draft}
        onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
        ceremony={ceremony}
        missing={tried ? missing : undefined}
        afterName={
          <Section label="ニックネーム">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={PROFILE_NICKNAME_MAX}
              aria-label="ニックネーム"
              placeholder="たろう"
              className={inputClass}
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-stone-400">
              ゲストブックに表示されます。空欄のときは「ゲスト」と番号の名前になります。※後日いつでも修正可能です
            </p>
          </Section>
        }
      />

      {error && (
        <p role="alert" className="mt-6 rounded-xl bg-rose-50 px-3 py-2.5 text-sm leading-relaxed text-rose-700">
          {error}
        </p>
      )}

      {!ready && (
        <p className="mt-8 text-center text-[12px] text-stone-500" aria-live="polite">
          あと {missing.length} 項目です
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className={`${ready ? "mt-8" : "mt-2"} min-h-12 w-full touch-manipulation rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40`}
      >
        {busy ? "送信中…" : "送信する"}
      </button>

      <p className="mt-3 text-center text-[11px] text-stone-400">
        {displayName ? `${displayName} として回答します` : ""}
      </p>
    </form>
  );
}
