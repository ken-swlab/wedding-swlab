import "server-only";
import { admin } from "@/lib/firebase-admin";
import { parsePaymentConfig, type PaymentConfig } from "@/lib/payment-config";

/**
 * 会費の金額（Issue #148）。置き場所は Firestore の config/payment だけ（コードに金額を書かない）。
 * 値を入れるのは `node scripts/ops.mjs payment set --party 20000 --second 5000 --car-fare 10000`。
 *
 * ★未設定・形が違うときは null★ 画面は金額を出さない（架空の額を出さない）。
 * ★60秒キャッシュ★ 招待状・会費タブを開くたびに読まない。値はほとんど変わらない。
 * ★読めなかったら直前の値を使う★（lib/invitation-server.ts と同じ）
 */
const TTL_MS = 60_000;
let cached: { at: number; value: PaymentConfig | null } | null = null;

export async function paymentConfig(now: number = Date.now()): Promise<PaymentConfig | null> {
  if (cached && now - cached.at < TTL_MS) return cached.value;

  let value = cached?.value ?? null;
  try {
    const snap = await admin().db.collection("config").doc("payment").get();
    if (!snap.exists) {
      console.error("[payment] config/payment が未設定です（scripts/ops.mjs payment set で入れてください）");
      value = null;
    } else {
      const parsed = parsePaymentConfig(snap.data());
      if (parsed.ok) value = parsed.value;
      else {
        console.error(`[payment] config/payment の形が違います（項目: ${parsed.field}）`);
        value = null;
      }
    }
  } catch (e) {
    console.error("[payment] 読み込みに失敗しました（直前の値を使います）", e);
  }
  cached = { at: now, value };
  return value;
}
