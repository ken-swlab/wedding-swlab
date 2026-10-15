/**
 * Firestore の config/payment の形の確認（Issue #148）。
 * サーバー（lib/payment-server.ts）と、値を入れる運用スクリプト（scripts/ops.mjs payment）の両方が使う。
 *
 * ★このファイルは `@/` で値を import しない★ scripts/ops.mjs と tests/ が Node でそのまま読み込む。
 * ★クライアントからは読み書きできない★（Rules の既定の拒否）。お車代の額は招待状に出さない。
 */

/** 会費の金額（円）。partyYen = 会食（1次会）、secondYen = 2次会、carFareYen = お車代（会費から差し引く額） */
export type PaymentConfig = {
  partyYen: number;
  secondYen: number;
  carFareYen: number;
};

export const PAYMENT_FIELDS = ["partyYen", "secondYen", "carFareYen"] as const;

/** 1項目の上限。打ち間違い（桁の多い値）をそのまま画面に流さない */
const MAX_YEN = 1_000_000;

/** 形を確かめて取り出す。だめなら、だめだった項目の名前を返す */
export function parsePaymentConfig(data: unknown): { ok: true; value: PaymentConfig } | { ok: false; field: string } {
  if (!data || typeof data !== "object") return { ok: false, field: "(全体)" };
  const d = data as Record<string, unknown>;
  const out = {} as PaymentConfig;
  for (const key of PAYMENT_FIELDS) {
    const v = d[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_YEN) return { ok: false, field: key };
    out[key] = v;
  }
  return { ok: true, value: out };
}
