import type { PaymentAttendance, PaymentItem } from "@/lib/payment-calc";

/** GET /api/guest/payment の応答（Issue #148）。呼び出した本人の分だけ */
export type PaymentStatusResponse = {
  /** config/payment が設定済みか。false なら金額を出さない */
  configured: boolean;
  /** 計算に使った出欠 */
  attendance: PaymentAttendance;
  items: PaymentItem[];
  /** 0 円未満にはならない */
  totalYen: number;
};
