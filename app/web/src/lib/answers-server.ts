import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { ATTENDANCE_OPTIONS, type Attendance } from "@/types/admin";

const ATTENDANCE_VALUES = new Set<string>(ATTENDANCE_OPTIONS.map((o) => o.value));

/** ゲストが自分で直せる回答（招待状と /guide/questionnaire の共通部分） */
export type Answers = {
  realName: string;
  kana: string;
  attendance: Attendance;
  allergy: string;
};

/**
 * 回答を検証する。上限は /api/guest/register と同じ。
 * 不正なら画面に出してよい文言を返す（{ error }）。
 */
export function parseAnswers(body: {
  realName?: unknown;
  kana?: unknown;
  attendance?: unknown;
  allergy?: unknown;
}): { answers: Answers } | { error: string } {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const realName = str(body.realName);
  const kana = str(body.kana);
  const allergy = str(body.allergy);
  if (!realName || realName.length > 40) return { error: "お名前は1〜40文字で入力してください" };
  if (kana.length > 40) return { error: "ふりがなは40文字までです" };
  if (allergy.length > 500) return { error: "アレルギー情報は500文字までです" };
  if (
    typeof body.attendance !== "string" ||
    !ATTENDANCE_VALUES.has(body.attendance) ||
    body.attendance === "unanswered"
  ) {
    return { error: "出欠の選択が不正です" };
  }
  return { answers: { realName, kana, attendance: body.attendance as Attendance, allergy } };
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
