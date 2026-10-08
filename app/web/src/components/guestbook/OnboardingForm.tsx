"use client";

import { useState, type FormEvent } from "react";
import {
  AnswerFields,
  EMPTY_ANSWER_DRAFT,
  Section,
  answerDraftReady,
  answerPayload,
  type AnswerDraft,
} from "@/components/guestbook/AnswerFields";
import { PROFILE_NICKNAME_MAX } from "@/config/profile";

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
  onSubmit: submit,
}: {
  /** LINE の表示名。フォームの下に「〜として回答します」と出す（★ニックネームの既定値には使わない★） */
  displayName?: string | null;
  initialNickname?: string;
  onSubmit: (answer: OnboardingAnswer) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AnswerDraft>(EMPTY_ANSWER_DRAFT);
  const [nickname, setNickname] = useState(initialNickname || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = answerDraftReady(draft);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
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
    <form onSubmit={onSubmit} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-8 text-center">
        <h2 className="font-serif text-lg text-stone-900">ご出席のご確認</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          ご入力いただいた内容を新郎新婦が確認のうえ、
          <br />
          ゲストブックを開放いたします。
        </p>
      </div>

      <AnswerFields
        value={draft}
        onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
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

      <button
        type="submit"
        disabled={busy || !ready}
        className="mt-8 min-h-12 w-full touch-manipulation rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
      >
        {busy ? "送信中…" : "送信する"}
      </button>

      <p className="mt-3 text-center text-[11px] text-stone-400">
        {displayName ? `${displayName} として回答します` : ""}
      </p>
    </form>
  );
}
