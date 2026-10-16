import type { ProgramItem, ProgramRole } from "@/types/invitation";

/**
 * 当日の流れ（config/invitation の program。Issue #166）から、画面に出す文字を組み立てる。
 * 招待状の PROGRAM・エントリー画面の上部・挙式の選択肢が、すべてここを通る（二重管理しない）。
 *
 * ★このファイルは型以外を `@/` で import しない★ tests/ が Node でそのまま読み込む。
 * ★時刻・日付をコードに書かない★ 引数で受け取ったものだけを組み立てる。
 */

/** 時刻が未定の行の表示 */
export const TIME_TBD = "--:--";

export function programTime(item: Pick<ProgramItem, "time">): string {
  return item.time || TIME_TBD;
}

function timeOf(program: readonly ProgramItem[], role: ProgramRole): string {
  return program.find((r) => r.role === role)?.time ?? "";
}

/**
 * 挙式の選択肢に添える時刻（例: 「15:00 集合 ／ 15:15 開始（任意参加）」「15:45 受付 ／ 16:15 開始」）。
 * 役目（role）の付いた行の時刻だけを使う。どれも無ければ空文字（選択肢は時刻なしで出す）。
 */
export function ceremonyChoiceNote(program: readonly ProgramItem[], choice: "ceremony" | "party"): string {
  const parts =
    choice === "ceremony"
      ? [[timeOf(program, "gather"), "集合"], [timeOf(program, "ceremony"), "開始（任意参加）"]]
      : [[timeOf(program, "reception"), "受付"], [timeOf(program, "party"), "開始"]];
  return parts
    .filter(([time]) => time)
    .map(([time, label]) => `${time} ${label}`)
    .join(" ／ ");
}

/** "2027.5.22" や "2027.05.22" を読む。読めなければ null */
function parseDotDate(date: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(date.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

/** 曜日（例: SAT）。日付として読めなければ空文字（曜日は出さない） */
export function weekdayOf(date: string): string {
  const p = parseDotDate(date);
  return p ? WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] : "";
}

/** エントリー画面の上部に出す、年を除いた日付と曜日（例: 5.22 SAT）。読めなければ元の文字のまま */
export function shortDateLabel(date: string): string {
  const p = parseDotDate(date);
  return p ? `${p.m}.${p.d} ${weekdayOf(date)}` : date;
}
