/**
 * 監査ログの終了の記録に件数を添えるための、内部用の応答ヘッダ（Issue #122）。
 * ハンドラが JSON（{ 名前: 数 }）で付け、withGuard が読んで監査ログに入れ、ブラウザへ返す前に外す。
 * 中身の形は lib/audit.ts の parseAuditCounts が確かめる（数だけ。値は入れない）。
 */
export const AUDIT_COUNTS_HEADER = "x-audit-counts";
