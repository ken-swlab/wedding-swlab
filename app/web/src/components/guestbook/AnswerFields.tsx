"use client";

import type { ReactNode } from "react";
import {
  ATTENDANCE_OPTIONS,
  CEREMONY_OPTIONS,
  type Attendance,
  type Ceremony,
} from "@/types/admin";
import type { CeremonyInfo } from "@/types/invitation";
import type { DrinkLevel } from "@/config/drink";
import { DrinkSlider } from "@/components/guestbook/DrinkSlider";
import { ANSWER_ALLERGY_MAX, ANSWER_NAME_PART_MAX, ANSWER_NOTE_MAX } from "@/config/answers";

/** フォームで入力中の回答。送るときは answerPayload で API の本文にする */
export type AnswerDraft = {
  lastName: string;
  firstName: string;
  lastKana: string;
  firstKana: string;
  attendance: Attendance;
  ceremony: Ceremony | "";
  /** お酒の量 0〜4（Issue #147）。未選択は null */
  drinkLevel: DrinkLevel | null;
  /** お車代を受け取るか（Issue #148）。未選択は null */
  carFare: boolean | null;
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
  drinkLevel: null,
  carFare: null,
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
  return answerDraftMissing(d).length === 0;
}

/** 足りない項目（Issue #157 A-3）。画面の上から順に並べる（最初の1つへスクロールする） */
export type AnswerField = "name" | "attendance" | "ceremony" | "drinkLevel" | "carFare" | "allergy";

export function answerDraftMissing(d: AnswerDraft): AnswerField[] {
  const out: AnswerField[] = [];
  if (!d.lastName.trim() || !d.firstName.trim() || !d.lastKana.trim() || !d.firstKana.trim()) out.push("name");
  if (d.attendance === "unanswered") out.push("attendance");
  if (asksCeremony(d.attendance) && d.ceremony === "") out.push("ceremony");
  if (asksCeremony(d.attendance) && d.drinkLevel === null) out.push("drinkLevel");
  if (asksCeremony(d.attendance) && d.carFare === null) out.push("carFare");
  if (d.hasAllergy === null || (d.hasAllergy === true && !d.allergy.trim())) out.push("allergy");
  return out;
}

/**
 * 足りない最初の項目までスクロールする。★送信ボタンは押せるままにする★（Issue #157 A-3）
 *   押せない理由が分からないまま、11 項目の中から探させないため。項目には data-answer-field を付けている。
 */
export function scrollToAnswerField(root: HTMLElement | null, field: AnswerField | undefined) {
  if (!root || !field) return;
  const el = root.querySelector<HTMLElement>(`[data-answer-field="${field}"]`);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * API（/api/guest/register・/api/guest/questionnaire）に送る本文。
 * ★隠れている項目の値は送らない★ 欠席なら挙式・お酒・お車代、「特になし」ならアレルギーの詳細を空にする
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
    drinkLevel: asksCeremony(d.attendance) ? d.drinkLevel : null,
    carFare: asksCeremony(d.attendance) ? d.carFare : null,
    hasAllergy: d.hasAllergy === true,
    allergy: d.hasAllergy ? d.allergy.trim() : "",
    note: d.note.trim(),
  };
}

/**
 * 挙式の選択肢の表記。★時刻はコードに書かない★ config/invitation の ceremony から組み立てる（Issue #146）。
 * まだ受け取れていない・未設定のときは時刻なしで出す。
 */
export function ceremonyFormLabel(value: Ceremony, info: CeremonyInfo | null | undefined): string {
  if (value === "party") return "パーティーから参加する";
  return info?.startAt ? `挙式（${info.startAt}〜）から参加する` : "挙式から参加する";
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2.5 text-base text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:bg-white";

/**
 * 出欠の回答の入力欄（お名前・ふりがな・ご出欠・挙式・お酒・お車代・アレルギー・備考）。
 * 招待状（OnboardingForm）と /guide/questionnaire で共通。送信ボタンと送信処理は呼び出し側が持つ。
 * afterName: ふりがなの下に差し込む欄（招待状のニックネーム）。
 */
export function AnswerFields({
  value,
  onChange,
  afterName,
  attendanceHint,
  ceremony,
  missing,
}: {
  value: AnswerDraft;
  onChange: (patch: Partial<AnswerDraft>) => void;
  afterName?: ReactNode;
  /** ご出欠の選択肢の下に出す補足（修正画面の「〜から〜に変更します」） */
  attendanceHint?: ReactNode;
  /** 挙式の時刻と案内文（config/invitation。GET /api/guest/invitation から受け取る） */
  ceremony?: CeremonyInfo | null;
  /** 送信を押したときに足りなかった項目。各項目の下に「〜してください」を出す（Issue #157 A-3） */
  missing?: readonly AnswerField[];
}) {
  const lack = (f: AnswerField) => !!missing?.includes(f);
  return (
    <div className="space-y-10">
      <Group no={1} title="お名前">
        <Section label="お名前" required field="name" error={lack("name") ? "お名前とふりがなを入力してください" : undefined}>
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
      </Group>

      <Group no={2} title="ご出欠">
        <Section label="ご出欠" required field="attendance" error={lack("attendance") ? "ご出欠を選んでください" : undefined}>
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
          {/* ★出欠が未選択でも、挙式の質問があることが分かるようにする★（Issue #146。選択肢は出席を選んでから） */}
          {value.attendance === "unanswered" && (
            <p className="mt-1.5 text-[11px] text-stone-400">ご出席の方には、挙式へのご参加もうかがいます</p>
          )}
        </Section>

        {asksCeremony(value.attendance) && (
          <Section label="挙式へのご参加" required field="ceremony" error={lack("ceremony") ? "挙式へのご参加を選んでください" : undefined}>
            {ceremony?.note && <p className="mb-2 text-[13px] leading-relaxed text-stone-500">{ceremony.note}</p>}
            <div className="grid grid-cols-1 gap-2">
              {CEREMONY_OPTIONS.map((o) => (
                <Choice key={o.value} on={value.ceremony === o.value} onClick={() => onChange({ ceremony: o.value })}>
                  {ceremonyFormLabel(o.value, ceremony)}
                </Choice>
              ))}
            </div>
          </Section>
        )}
      </Group>

      <Group no={3} title="当日のこと">
        {asksCeremony(value.attendance) && (
          <Section label="お酒はどれくらい飲みますか？" required field="drinkLevel" error={lack("drinkLevel") ? "お酒の量を選んでください" : undefined}>
            <p className="mb-1 text-[11px] text-stone-400">乾杯のご準備に使います。この内容は新郎新婦とご本人だけが見られます。</p>
            <DrinkSlider value={value.drinkLevel} onChange={(v) => onChange({ drinkLevel: v })} />
          </Section>
        )}

        {asksCeremony(value.attendance) && (
          <Section label="お車代について" required field="carFare" error={lack("carFare") ? "お車代を受け取るかを選んでください" : undefined}>
            {/* ★条件や金額は書かない★（Issue #148。希望する人にはお渡しする、というスタンス） */}
            <p className="text-[13px] leading-relaxed text-stone-500">
              せっかく足を運んでいただくので、お車代をご用意しています。遠い・近いは気にせず、ご希望の方はお気軽にお知らせください。
            </p>
            <p className="mb-2 mt-3 text-sm font-medium text-stone-700">お車代をお受け取りになりますか？</p>
            <div className="grid grid-cols-2 gap-2">
              <Choice on={value.carFare === true} onClick={() => onChange({ carFare: true })}>
                はい
              </Choice>
              <Choice on={value.carFare === false} onClick={() => onChange({ carFare: false })}>
                いいえ
              </Choice>
            </div>
            <p className="mt-1.5 text-[11px] text-stone-400">お車代は会費から差し引いてお渡しします。</p>
          </Section>
        )}

        <Section label="食物アレルギー" required field="allergy" error={lack("allergy") ? (value.hasAllergy ? "アレルギーの内容を入力してください" : "食物アレルギーの有無を選んでください") : undefined}>
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
      </Group>

      <Group no={4} title="メッセージ">
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
      </Group>
    </div>
  );
}

/** まとまりの数（見出しの「1/4」の分母） */
const GROUP_COUNT = 4;

/**
 * 項目のまとまりの見出し（Issue #157 B-3）。1 枚のカードのまま、4 つに区切って「いまどこか」を見せる。
 * ★段階に分けて画面を切り替える形にはしない★（オーナーの判断）戻る・直すの作りを増やさない。
 */
function Group({ no, title, children }: { no: number; title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-8">
      <h3 className="flex items-baseline gap-2 border-b border-stone-200 pb-2 text-sm font-semibold text-stone-800">
        <span className="text-[11px] font-medium tabular-nums tracking-wider text-stone-500">
          {no}/{GROUP_COUNT}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function RequiredBadge() {
  return <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">必須</span>;
}

/** 項目のまとまり。見出しに「必須」「任意」を付ける。error は足りないときの案内（送信を押したあとだけ） */
export function Section({
  label,
  required,
  field,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  field?: AnswerField;
  error?: string;
  children: ReactNode;
}) {
  return (
    <fieldset data-answer-field={field} className="scroll-mt-6">
      <legend className="mb-1.5 flex items-center gap-2 text-xs font-medium text-stone-600">
        {label}
        {required ? <RequiredBadge /> : <span className="text-[10px] font-normal text-stone-400">任意</span>}
      </legend>
      {children}
      {error && (
        <p role="alert" className="mt-2 text-[12px] font-medium text-rose-600">
          {error}
        </p>
      )}
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
