"use client";

import type { ReactNode } from "react";
import {
  ATTENDANCE_OPTIONS,
  CEREMONY_NOTE,
  CEREMONY_OPTIONS,
  type Attendance,
  type Ceremony,
} from "@/types/admin";
import { ANSWER_ALLERGY_MAX, ANSWER_NAME_PART_MAX, ANSWER_NOTE_MAX } from "@/config/answers";

/** フォームで入力中の回答。送るときは answerPayload で API の本文にする */
export type AnswerDraft = {
  lastName: string;
  firstName: string;
  lastKana: string;
  firstKana: string;
  attendance: Attendance;
  ceremony: Ceremony | "";
  /** 未選択は null */
  hasAllergy: boolean | null;
  allergy: string;
  note: string;
};

export const EMPTY_ANSWER_DRAFT: AnswerDraft = {
  lastName: "",
  firstName: "",
  lastKana: "",
  firstKana: "",
  attendance: "unanswered",
  ceremony: "",
  hasAllergy: null,
  allergy: "",
  note: "",
};

/** 出欠で欠席以外を選んだときだけ、挙式へのご参加を聞く */
export function asksCeremony(attendance: Attendance): boolean {
  return attendance !== "unanswered" && attendance !== "declined";
}

/** 必須の項目がそろっているか（検証の本体はサーバーの parseAnswers） */
export function answerDraftReady(d: AnswerDraft): boolean {
  return (
    !!d.lastName.trim() &&
    !!d.firstName.trim() &&
    !!d.lastKana.trim() &&
    !!d.firstKana.trim() &&
    d.attendance !== "unanswered" &&
    (!asksCeremony(d.attendance) || d.ceremony !== "") &&
    d.hasAllergy !== null &&
    (d.hasAllergy === false || !!d.allergy.trim())
  );
}

/**
 * API（/api/guest/register・/api/guest/questionnaire）に送る本文。
 * ★隠れている項目の値は送らない★ 欠席なら挙式、「特になし」ならアレルギーの詳細を空にする
 *   （選び直す前に入れた値が残っていても保存しない。サーバーの parseAnswers も同じく捨てる）。
 */
export function answerPayload(d: AnswerDraft) {
  return {
    lastName: d.lastName.trim(),
    firstName: d.firstName.trim(),
    lastKana: d.lastKana.trim(),
    firstKana: d.firstKana.trim(),
    attendance: d.attendance,
    ceremony: asksCeremony(d.attendance) ? d.ceremony : "",
    hasAllergy: d.hasAllergy === true,
    allergy: d.hasAllergy ? d.allergy.trim() : "",
    note: d.note.trim(),
  };
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2.5 text-base text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:bg-white";

/**
 * 出欠の回答の入力欄（お名前・ふりがな・ご出欠・挙式・アレルギー・備考）。
 * 招待状（OnboardingForm）と /guide/questionnaire で共通。送信ボタンと送信処理は呼び出し側が持つ。
 * afterName: ふりがなの下に差し込む欄（招待状のニックネーム）。
 */
export function AnswerFields({
  value,
  onChange,
  afterName,
  attendanceHint,
}: {
  value: AnswerDraft;
  onChange: (patch: Partial<AnswerDraft>) => void;
  afterName?: ReactNode;
  /** ご出欠の選択肢の下に出す補足（修正画面の「〜から〜に変更します」） */
  attendanceHint?: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <Section label="お名前" required>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={value.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            maxLength={ANSWER_NAME_PART_MAX}
            required
            autoComplete="family-name"
            aria-label="姓"
            placeholder="姓（例: 前川）"
            className={inputClass}
          />
          <input
            value={value.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            maxLength={ANSWER_NAME_PART_MAX}
            required
            autoComplete="given-name"
            aria-label="名"
            placeholder="名（例: 太郎）"
            className={inputClass}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-stone-400">席次表のご用意に使います。他のゲストには表示されません。</p>

        <p className="mt-5 flex items-center gap-2 text-xs font-medium text-stone-600">
          ふりがな
          <RequiredBadge />
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={value.lastKana}
            onChange={(e) => onChange({ lastKana: e.target.value })}
            maxLength={ANSWER_NAME_PART_MAX}
            required
            aria-label="せい"
            placeholder="せい（例: まえかわ）"
            className={inputClass}
          />
          <input
            value={value.firstKana}
            onChange={(e) => onChange({ firstKana: e.target.value })}
            maxLength={ANSWER_NAME_PART_MAX}
            required
            aria-label="めい"
            placeholder="めい（例: たろう）"
            className={inputClass}
          />
        </div>
      </Section>

      {afterName}

      <Section label="ご出欠" required>
        <div className="grid grid-cols-1 gap-2">
          {ATTENDANCE_OPTIONS.filter((o) => o.value !== "unanswered").map((o) => (
            <Choice
              key={o.value}
              on={value.attendance === o.value}
              onClick={() => onChange({ attendance: o.value })}
            >
              {o.formLabel}
            </Choice>
          ))}
        </div>
        {attendanceHint}
      </Section>

      {asksCeremony(value.attendance) && (
        <Section label="挙式へのご参加" required>
          <p className="mb-2 text-[13px] leading-relaxed text-stone-500">{CEREMONY_NOTE}</p>
          <div className="grid grid-cols-1 gap-2">
            {CEREMONY_OPTIONS.map((o) => (
              <Choice key={o.value} on={value.ceremony === o.value} onClick={() => onChange({ ceremony: o.value })}>
                {o.formLabel}
              </Choice>
            ))}
          </div>
        </Section>
      )}

      <Section label="食物アレルギー" required>
        <div className="grid grid-cols-2 gap-2">
          <Choice on={value.hasAllergy === true} onClick={() => onChange({ hasAllergy: true })}>
            はい
          </Choice>
          <Choice on={value.hasAllergy === false} onClick={() => onChange({ hasAllergy: false })}>
            特になし
          </Choice>
        </div>
        {value.hasAllergy === true && (
          <textarea
            value={value.allergy}
            onChange={(e) => onChange({ allergy: e.target.value })}
            rows={3}
            maxLength={ANSWER_ALLERGY_MAX}
            required
            aria-label="食物アレルギーの内容"
            placeholder="例：えび、かに"
            className={`${inputClass} resize-none leading-relaxed`}
          />
        )}
        <p className="mt-1.5 text-[11px] text-stone-400">この内容は新郎新婦とご本人だけが見られます。</p>
      </Section>

      <Section label="備考・連絡事項">
        <p className="text-[13px] leading-relaxed text-stone-500">
          その他、新郎新婦へ伝えておきたい事や連絡事項があればご記入ください。
        </p>
        <textarea
          value={value.note}
          onChange={(e) => onChange({ note: e.target.value })}
          rows={3}
          maxLength={ANSWER_NOTE_MAX}
          aria-label="備考・連絡事項"
          className={`${inputClass} resize-none leading-relaxed`}
        />
      </Section>
    </div>
  );
}

function RequiredBadge() {
  return <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">必須</span>;
}

/** 項目のまとまり。見出しに「必須」「任意」を付ける */
export function Section({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 flex items-center gap-2 text-xs font-medium text-stone-600">
        {label}
        {required ? <RequiredBadge /> : <span className="text-[10px] font-normal text-stone-400">任意</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-12 touch-manipulation rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
        on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
      }`}
    >
      {children}
    </button>
  );
}
