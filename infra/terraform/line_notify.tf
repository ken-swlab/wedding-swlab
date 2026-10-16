# 公式 LINE（Messaging API）の通知のアウトボックス（Issue #168）
#
# lineOutbox/{dedupeKey}（例: approved:<uid>）は、サーバーの送信係（app/web/src/lib/line-notify-server.ts）だけが
# 読み書きする。Rules には書かない（既定の拒否。infra/firestore/test に DENY のテストがある）。
#
# ★TTL は 400 日（監査ログと同じ）★ ドキュメントの expiresAt に作成から 400 日後を入れ、ここで TTL を有効にする。
#   日数はアプリの LINE_OUTBOX_RETENTION_DAYS（app/web/src/config/line-notify.ts）。
#   重複防止のキーはこの期間だけ効く（消えたあとに再承認されると、もう一度送られる）。
# index_config {} は「この項目の単一フィールドインデックスを作らない」（audit.tf の TTL と同じ理由）。

resource "google_firestore_field" "line_outbox_ttl" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "lineOutbox"
  field      = "expiresAt"

  ttl_config {}
  index_config {}
}
