import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { ATTENDANCE_OPTIONS, CEREMONY_OPTIONS, type Attendance, type Ceremony } from "@/types/admin";
import { ANSWER_ALLERGY_MAX, ANSWER_NAME_PART_MAX, ANSWER_NOTE_MAX } from "@/config/answers";

const ATTENDANCE_VALUES = new Set<string>(ATTENDANCE_OPTIONS.map((o) => o.value));
const CEREMONY_VALUES = new Set<string>(CEREMONY_OPTIONS.map((o) => o.value));

/** ゲストが自分で直せる回答（招待状と /guide/questionnaire の共通部分） */
export type Answers = {
  lastName: string;
  firstName: string;
  lastKana: string;
  firstKana: string;
  /** 「姓 名」。管理画面・名簿・席次の既存の読み手のために、分けた値と一緒に保存する */
  realName: string;
  /** 「せい めい」 */
  kana: string;
  attendance: Exclude<Attendance, "unanswered">;
  /** 欠席なら "" */
  ceremony: Ceremony | "";
  hasAllergy: boolean;
  /** hasAllergy が false なら "" */
  allergy: string;
  note: string;
};

export type AnswersBody = {
  lastName?: unknown;
  firstName?: unknown;
  lastKana?: unknown;
  firstKana?: unknown;
  attendance?: unknown;
  ceremony?: unknown;
  hasAllergy?: unknown;
  allergy?: unknown;
  note?: unknown;
};

/**
 * 回答を検証する。/api/guest/register と /api/guest/questionnaire の共通。
 * 不正なら画面に出してよい文言を返す（{ error }）。
 *
 * ★欠席なら挙式、アレルギーが「特になし」なら詳細を、送られてきても捨てる★
 *   フォームで選び直したときに隠れた入力欄の値が残っていても、保存される値を選択と食い違わせない。
 */
export function parseAnswers(body: AnswersBody): { answers: Answers } | { error: string } {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const lastName = str(body.lastName);
  const firstName = str(body.firstName);
  const lastKana = str(body.lastKana);
  const firstKana = str(body.firstKana);
  const n = ANSWER_NAME_PART_MAX;
  if (!lastName || !firstName || lastName.length > n || firstName.length > n) {
    return { error: `お名前は姓・名それぞれ1〜${n}文字で入力してください` };
  }
  if (!lastKana || !firstKana || lastKana.length > n || firstKana.length > n) {
    return { error: `ふりがなは せい・めい それぞれ1〜${n}文字で入力してください` };
  }
  if (
    typeof body.attendance !== "string" ||
    !ATTENDANCE_VALUES.has(body.attendance) ||
    body.attendance === "unanswered"
  ) {
    return { error: "出欠の選択が不正です" };
  }
  const attendance = body.attendance as Answers["attendance"];

  let ceremony: Answers["ceremony"] = "";
  if (attendance !== "declined") {
    if (typeof body.ceremony !== "string" || !CEREMONY_VALUES.has(body.ceremony)) {
      return { error: "挙式へのご参加を選んでください" };
    }
    ceremony = body.ceremony as Ceremony;
  }

  if (typeof body.hasAllergy !== "boolean") return { error: "食物アレルギーの有無を選んでください" };
  const hasAllergy = body.hasAllergy;
  const allergy = hasAllergy ? str(body.allergy) : "";
  if (hasAllergy && !allergy) return { error: "食物アレルギーの内容をご記入ください" };
  if (allergy.length > ANSWER_ALLERGY_MAX) return { error: `アレルギー情報は${ANSWER_ALLERGY_MAX}文字までです` };

  const note = str(body.note);
  if (note.length > ANSWER_NOTE_MAX) return { error: `備考・連絡事項は${ANSWER_NOTE_MAX}文字までです` };

  return {
    answers: {
      lastName,
      firstName,
      lastKana,
      firstKana,
      realName: `${lastName} ${firstName}`,
      kana: `${lastKana} ${firstKana}`,
      attendance,
      ceremony,
      hasAllergy,
      allergy,
      note,
    },
  };
}

/** guestPrivate に書く回答のフィールド（register と questionnaire で同じ形にする） */
export function answersPrivatePatch(a: Answers): Record<string, unknown> {
  return {
    lastName: a.lastName,
    firstName: a.firstName,
    lastKana: a.lastKana,
    firstKana: a.firstKana,
    realName: a.realName,
    kana: a.kana,
    attendance: a.attendance,
    ceremony: a.ceremony,
    hasAllergy: a.hasAllergy,
    allergy: a.allergy,
    note: a.note,
  };
}

/** 管理画面で「変更あり」を出す項目（Issue #52。料理と座席に関わるもの） */
export type AnswerChangeField = "attendance" | "allergy";

/**
 * 登録済みのゲストが回答を変えたときに guestAdmin へ書く印。変わっていなければ null。
 *
 * ★印は guestAdmin（管理者だけが読める）に置く★ 本人に「通知済みかどうか」を見せる必要はない。
 * ★管理者が「確認済み」にするまで、変わった項目を積み上げる★
 *   attendanceBefore は、確認済みにしてから最初に出欠が変わる前の値（何から変わったかを出すため）。
 *   消すのは /api/admin/update-guest の ackAnswerChange。
 * ★本名・ふりがなの変更は印を付けない★（オーナーの判断。出欠とアレルギーだけ）
 * 値そのもの（アレルギーの中身）は guestAdmin に複製しない。今の値は guestPrivate にある。
 */
export function answerChangePatch(
  privateSnap: DocumentSnapshot,
  adminSnap: DocumentSnapshot,
  next: Pick<Answers, "attendance" | "allergy">,
): Record<string, unknown> | null {
  const prevAttendance = (privateSnap.get("attendance") as string | undefined) ?? "unanswered";
  const prevAllergy = ((privateSnap.get("allergy") as string | undefined) ?? "").trim();

  const changed: AnswerChangeField[] = [];
  if (prevAttendance !== next.attendance) changed.push("attendance");
  if (prevAllergy !== next.allergy) changed.push("allergy");
  if (changed.length === 0) return null;

  const patch: Record<string, unknown> = {
    answerChangeUnread: true,
    answerChangedAt: FieldValue.serverTimestamp(),
    answerChangeFields: FieldValue.arrayUnion(...changed),
  };
  const pendingFields = adminSnap.get("answerChangeUnread") === true
    ? ((adminSnap.get("answerChangeFields") as string[] | undefined) ?? [])
    : [];
  if (changed.includes("attendance") && !pendingFields.includes("attendance")) {
    patch.attendanceBefore = prevAttendance;
  }
  return patch;
}
