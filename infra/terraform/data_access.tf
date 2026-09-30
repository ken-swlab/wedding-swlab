###############################################################
# Phase 6 : 個人情報の「閲覧」を Cloud Audit Logs で記録する
#
#   管理画面は guestPrivate / guestAdmin / faces をブラウザから
#   Firestore へ直接読みに行く。ここは withGuard（アプリの監査ログ）を
#   通らないので、Firestore 側の Data Access 監査ログで
#   「誰が・いつ・どこから・何を読んだか」を残す。
#   Firebase Auth で読んだ場合も、トークンの中身（uid・admin クレーム）が
#   authenticationInfo.thirdPartyPrincipal に記録される。
#
#   ★DATA_READ だけを有効にする（DATA_WRITE は有効にしない）★
#     書き込みの監査ログには書き込んだ値（request.writes）が載る。
#     本名やアレルギーを更新するたびに値がログへ複製され、
#     削除依頼に応えられなくなる。個人情報の書き込みは Rules で
#     禁止して API 経由に限っているので、アプリの監査ログ（キーのみ）で足りる。
#
#   ★3段階で進める（招待状を配る前に第2段階まで）★
#     1. 実ログで項目名を確かめる（両方の default = false）
#     2. pii_access_minimize = true
#          ゲスト本人が自分の回答を読んだ記録は捨てる（Rules 上、管理者以外が
#          成功できる読み取りは自分の guestPrivate だけ）。Firestore の閲覧ログを
#          _Default（30日保持・全員の LINE 表示名入り）からも外す。
#     3. pii_access_bucket_locked = true
#          保持期間を固定する。取り消し不可。
#   切り替えは tfvars ではなく下の default を書き換えてコミットする。
#   tfvars は Git に入らないので、Codespaces を作り直すと第1段階へ戻ってしまう。
###############################################################

variable "pii_access_retention_days" {
  description = "個人情報の閲覧ログの保持日数"
  type        = number
  default     = 400
}

variable "pii_access_minimize" {
  description = "true: 管理者・サービスアカウント・Google アカウント・拒否された読み取りだけを残す"
  type        = bool
  default     = false
}

variable "pii_access_bucket_locked" {
  description = "true にすると閲覧ログの保持期間をロックする（取り消し不可）"
  type        = bool
  default     = false
}

locals {
  firestore_data_access = join(" AND ", [
    "logName=\"projects/${var.project_id}/logs/cloudaudit.googleapis.com%2Fdata_access\"",
    "protoPayload.serviceName=\"firestore.googleapis.com\"",
  ])

  # 引用符だけの語は「どの項目に含まれていてもよい」部分一致（大文字小文字を区別しない）。
  # ドキュメントのパスにも、一覧取得のコレクション名にも当たる。
  # OR は括弧で囲んで意図を明示する（このクエリ言語は OR が AND より先に結びつくため、
  # 他の言語の感覚で読むと誤読しやすい）。
  pii_targets = "(\"guestPrivate\" OR \"guestAdmin\" OR \"faces\" OR \"auditLogs\")"

  # 管理者ではない Firebase ユーザーの、成功した読み取り
  guest_self_read = join(" AND ", [
    "protoPayload.authenticationInfo.thirdPartyPrincipal:*",
    "NOT protoPayload.authenticationInfo.thirdPartyPrincipal.payload.admin=true",
    "NOT protoPayload.status.code>0",
  ])

  pii_access_filter_full      = "${local.firestore_data_access} AND ${local.pii_targets}"
  pii_access_filter_minimized = "${local.pii_access_filter_full} AND NOT (${local.guest_self_read})"
}

# --- 1. Firestore の読み取りを監査ログに出す ---------------------
#   datastore.googleapis.com を指定すると firestore.googleapis.com にも効く。
#   このリソースはサービス単位で権威的（コンソールで足した設定は上書きされる）。
resource "google_project_iam_audit_config" "firestore_data_read" {
  project = var.project_id
  service = "datastore.googleapis.com"

  audit_log_config {
    log_type = "DATA_READ"
  }
}

# --- 2. 専用のログバケット（東京リージョン）-----------------------
resource "google_logging_project_bucket_config" "pii_access" {
  project        = var.project_id
  location       = var.region
  bucket_id      = "pii-access"
  description    = "Firestore の個人情報コレクションへの読み取り記録"
  retention_days = var.pii_access_retention_days
  locked         = var.pii_access_bucket_locked

  depends_on = [google_project_service.enabled]

  lifecycle {
    prevent_destroy = true
  }
}

# --- 3. 個人情報コレクションへの読み取りだけを専用バケットへ ----------
#   同じプロジェクトのログバケット宛てなので、書き込み用の権限付与は要らない。
resource "google_logging_project_sink" "pii_access" {
  project                = var.project_id
  name                   = "pii-access"
  description            = "guestPrivate / guestAdmin / faces / auditLogs の読み取り"
  destination            = "logging.googleapis.com/${google_logging_project_bucket_config.pii_access.id}"
  filter                 = var.pii_access_minimize ? local.pii_access_filter_minimized : local.pii_access_filter_full
  unique_writer_identity = true
}

# --- 4. 第2段階: Firestore の閲覧ログを _Default から外す -----------
#   プロジェクトの除外フィルタは _Default シンクにだけ効く。
#   上の pii-access シンクには影響しない。
resource "google_logging_project_exclusion" "firestore_data_access_default" {
  count       = var.pii_access_minimize ? 1 : 0
  project     = var.project_id
  name        = "firestore-data-access"
  description = "Firestore の Data Access ログは pii-access にだけ残す"
  filter      = local.firestore_data_access
}

output "pii_access_bucket" {
  value = google_logging_project_bucket_config.pii_access.bucket_id
}

output "pii_access_location" {
  value = var.region
}

# 第1段階のうちに、第2段階のフィルタで管理者の記録が残ることを確かめるために出す
output "pii_access_filter_minimized" {
  value = local.pii_access_filter_minimized
}
