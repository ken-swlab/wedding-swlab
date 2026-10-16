/**
 * 公式 LINE（Messaging API）からの通知の決まりごと（Issue #168）。送信係は src/lib/line-notify-server.ts。
 */

/** Messaging API の入口（サーバーからだけ呼ぶ。ブラウザの CSP には足さない） */
export const LINE_API_BASE = "https://api.line.me";

/**
 * 月の通数の残りがこれを下回ったら送らない（status: skipped、理由 quota）。
 * ★無料の枠を使い切ると、その月はほかの通知（将来の当日の連絡など）も送れなくなる★ 余白を残す。
 */
export const LINE_QUOTA_MIN_REMAINING = 20;

/**
 * アウトボックス（lineOutbox）の保持日数。expiresAt に入れ、Firestore の TTL で消える
 * （infra/terraform/line_notify.tf）。★監査ログ（AUDIT_RETENTION_DAYS）と同じ 400 日★
 * ★重複防止のキーは、この日数のあいだだけ効く★ 400 日を過ぎて再承認されると、もう一度送られる。
 */
export const LINE_OUTBOX_RETENTION_DAYS = 400;

/** Messaging API の1回の呼び出しを待つ上限 (ms) */
export const LINE_API_TIMEOUT_MS = 8000;

/** 再送（/api/admin/notify/retry）で、1回に送るアウトボックスの件数の上限 */
export const LINE_RETRY_BATCH = 20;
