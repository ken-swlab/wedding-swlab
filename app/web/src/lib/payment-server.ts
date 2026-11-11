import "server-only";
import { admin } from "@/lib/firebase-admin";
import { memo } from "@/lib/server-memo";
import { parsePaymentConfig, type PaymentConfig } from "@/lib/payment-config";

/**
 * 会費の金額（Issue #148）。置き場所は Firestore の config/payment だけ（コードに金額を書かない）。
 * 値を入れるのは `node scripts/ops.mjs payment set --party 20000 --second 5000 --car-fare 10000`。
 *
 * ★未設定・形が違うときは null★ 画面は金額を出さない（架空の額を出さない）。
 * ★PAYMENT_CONFIG_TTL_MS だけ使い回す★（lib/server-memo.ts。Issue #286）招待状・会費タブを開くたびに読まない。
 *   同時に来た呼び出しは、読んでいる1回を待つ。本人の出欠とお車代は、呼び出し側で毎回読む。
 * ★読めなかったら直前の値を使う★（lib/invitation-server.ts と同じ）
 */
const PAYMENT_CONFIG_TTL_MS = 60_000;
let last: PaymentConfig | null = null;

export function paymentConfig(): Promise<PaymentConfig | null> {
  return memo("payment-config", PAYMENT_CONFIG_TTL_MS, async () => {
    try {
      const snap = await admin().db.collection("config").doc("payment").get();
      if (!snap.exists) {
        console.error("[payment] config/payment が未設定です（scripts/ops.mjs payment set で入れてください）");
        last = null;
      } else {
        const parsed = parsePaymentConfig(snap.data());
        if (parsed.ok) last = parsed.value;
        else {
          console.error(`[payment] config/payment の形が違います（項目: ${parsed.field}）`);
          last = null;
        }
      }
    } catch (e) {
      console.error("[payment] 読み込みに失敗しました（直前の値を使います）", e);
    }
    return last;
  });
}
