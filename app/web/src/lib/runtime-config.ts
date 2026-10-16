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
  /** 公式 LINE からの通知（Issue #168）。lib/line-notify-server.ts の LineNotifyMode */
  lineNotify: LineNotifyMode;
};

/**
 * 公式 LINE からの通知の停止スイッチとテスト用モード（Issue #168）。★既定は off★
 *   off        … 送らない（アウトボックスに記録だけ残す）
 *   dryRun     … 送らずに、送る内容をログに出す
 *   adminsOnly … 管理者にだけ送る（本番での動作確認用）
 *   on         … 全員に送る
 * 切り替えは scripts/ops.mjs notify mode <off|dryRun|adminsOnly|on>。
 */
export const LINE_NOTIFY_MODES = ["off", "dryRun", "adminsOnly", "on"] as const;
export type LineNotifyMode = (typeof LINE_NOTIFY_MODES)[number];

const TTL_MS = 10_000;
const DEFAULT: RuntimeConfig = { maintenance: false, message: "", lineNotify: "off" };
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
    const mode = snap.get("lineNotify");
    value = {
      maintenance: snap.get("maintenance") === true,
      message: typeof msg === "string" ? msg.slice(0, 200) : "",
      // 知らない値は off（送らない側に倒す）
      lineNotify: LINE_NOTIFY_MODES.find((m) => m === mode) ?? "off",
    };
  } catch (e) {
    console.error("[runtime-config] 読み込みに失敗しました（直前の値を使います）", e);
  }
  cached = { at: now, value };
  return value;
}
