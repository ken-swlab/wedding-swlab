import "server-only";
import { admin } from "@/lib/firebase-admin";

/**
 * 実行時の設定（キルスイッチ）
 *
 * ★環境変数ではなく Firestore の config/runtime に置く★
 *   Vercel の環境変数は変更しても再デプロイするまで反映されない。
 *   インシデント時に1〜2分のビルドを待っていられないので、
 *   Firestore のドキュメントを scripts/ops.mjs から書き換えて即時に効かせる。
 *
 * ★10秒キャッシュ★
 *   全リクエストで読むと読み取り課金が増える。10秒あれば十分速い。
 *
 * ★読めなかったら直前の値を使う★
 *   Firestore の一時障害でメンテナンス状態が勝手に解除されたり、
 *   逆に全員が締め出されたりしないようにする。
 */

export type RuntimeConfig = {
  maintenance: boolean;
  message: string;
};

const TTL_MS = 10_000;
const DEFAULT: RuntimeConfig = { maintenance: false, message: "" };
let cached: { at: number; value: RuntimeConfig } | null = null;

/** テスト用 */
export function __resetRuntimeConfigForTest() {
  cached = null;
}

export async function runtimeConfig(now: number = Date.now()): Promise<RuntimeConfig> {
  if (cached && now - cached.at < TTL_MS) return cached.value;

  let value = cached?.value ?? DEFAULT;
  try {
    const snap = await admin().db.collection("config").doc("runtime").get();
    const msg = snap.get("message");
    value = {
      maintenance: snap.get("maintenance") === true,
      message: typeof msg === "string" ? msg.slice(0, 200) : "",
    };
  } catch (e) {
    console.error("[runtime-config] 読み込みに失敗しました（直前の値を使います）", e);
  }
  cached = { at: now, value };
  return value;
}
