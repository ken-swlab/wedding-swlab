import type { PaymentConfig } from "./payment-config.ts";

/**
 * 人ごとの会費の内訳（Issue #148）。GET /api/guest/payment が呼び出した本人の分だけを計算して返す。
 *
 * ★このファイルは `@/` で値を import しない★ tests/payment-calc.test.mjs が Node でそのまま読み込む。
 * ★合計は 0 円未満にしない★ 例: 2次会のみ＋お車代 → 5,000 − 10,000 でも 0 円。
 *   内訳のお車代は設定どおりの額を出す（差し引ける分だけに丸めない）。
 * ★2次会の金額が未定（secondTentative）の間は、2次会の分を tentative にして合計に含めない★（Issue #270）
 *   決まっていない額を送金させない。画面は「金額は決まり次第お知らせします」と出す。
 */

/** 出欠（types/admin.ts の Attendance と同じ値） */
export type PaymentAttendance = "unanswered" | "both" | "first_only" | "second_only" | "declined";

/** tentative … 金額がまだ決まっていない（2次会。Issue #270）。合計に含めない */
export type PaymentItem = { label: string; yen: number; tentative?: boolean };
export type PaymentBreakdown = { items: PaymentItem[]; totalYen: number };

export function paymentBreakdown(
  config: PaymentConfig,
  attendance: PaymentAttendance,
  carFare: boolean,
): PaymentBreakdown {
  const items: PaymentItem[] = [];
  if (attendance === "both" || attendance === "first_only") items.push({ label: "会食", yen: config.partyYen });
  if (attendance === "both" || attendance === "second_only") {
    items.push(config.secondTentative ? { label: "2次会", yen: config.secondYen, tentative: true } : { label: "2次会", yen: config.secondYen });
  }
  // 欠席・未回答の人にはお車代を出さない（出席しない人に差し引くものがない）
  if (carFare && items.length > 0 && config.carFareYen > 0) items.push({ label: "お車代", yen: -config.carFareYen });
  const sum = items.reduce((s, i) => s + (i.tentative ? 0 : i.yen), 0);
  return { items, totalYen: Math.max(0, sum) };
}
