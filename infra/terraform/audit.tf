###############################################################
# Phase 3 : 監査ログの保全 / レートリミットの自動掃除
#
#   1. Firestore TTL ポリシー
#      rateLimits.expiresAt / auditLogs.expiresAt を過ぎた文書を自動削除。
#      TTL の削除は期限後おおむね24時間以内に行われる（即時ではない）。
#
#   2. 監査ログの WORM 保管（Write Once Read Many）
#      毎日 auditLogs だけを GCS へエクスポートする。バケットには
#      保持ポリシーを掛け、ロックすると「誰にも（プロジェクトオーナーにも）
#      期限まで消せない」状態になる。サービスアカウント鍵が漏れても、
#      エクスポート済みの記録は改ざんも削除もできない。
#
#   ★エクスポートするのは auditLogs だけ★
#     guestPrivate（本名・アレルギー）まで入れると、削除依頼を受けても
#     保持期限まで消せなくなる。監査ログには値を入れていないので、
#     ロックしても個人情報の削除義務とぶつからない。
#
#   ★ロックは2段階で★
#     audit_bucket_locked = false で apply → エクスポートが届くことを確認
#     → true にして apply。ロックは取り消せない。
###############################################################

variable "audit_retention_days" {
  description = "監査ログの保持日数（Firestore の TTL と GCS の保持期間の両方）"
  type        = number
  default     = 400
}

variable "audit_bucket_locked" {
  description = "true にすると保持ポリシーをロックする（取り消し不可）"
  type        = bool
  default     = false
}

# --- 1. TTL ポリシー -------------------------------------------
# index_config {} は「この項目の単一フィールドインデックスを作らない」。
# 期限の値は単調増加なので、インデックスを持つと書き込みが偏る。
# どちらも並べ替えや絞り込みには使っていない。

resource "google_firestore_field" "rate_limits_ttl" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "rateLimits"
  field      = "expiresAt"

  ttl_config {}
  index_config {}
}

resource "google_firestore_field" "audit_logs_ttl" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "auditLogs"
  field      = "expiresAt"

  ttl_config {}
  index_config {}
}

# --- 2. WORM バケット ------------------------------------------
resource "google_storage_bucket" "audit_archive" {
  project  = var.project_id
  name     = "${var.project_id}-audit-archive"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  retention_policy {
    retention_period = var.audit_retention_days * 86400
    is_locked        = var.audit_bucket_locked
  }

  # 保持期限を過ぎたものは自動で消す（放っておくと無限に溜まる）
  lifecycle_rule {
    condition {
      age = var.audit_retention_days + 1
    }
    action {
      type = "Delete"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

# --- 3. エクスポート専用のサービスアカウント ----------------
#   アプリ用の wedding-app-server とは分ける。アプリの鍵が漏れても
#   エクスポートの設定は触れない。
resource "google_service_account" "audit_exporter" {
  project      = var.project_id
  account_id   = "wedding-audit-exporter"
  display_name = "Wedding - audit log exporter"
  description  = "Cloud Scheduler から auditLogs を GCS へ毎日エクスポートする"
}

resource "google_project_iam_member" "audit_exporter_firestore" {
  project = var.project_id
  role    = "roles/datastore.importExportAdmin"
  member  = "serviceAccount:${google_service_account.audit_exporter.email}"
}

resource "google_storage_bucket_iam_member" "audit_exporter_bucket" {
  bucket = google_storage_bucket.audit_archive.name
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.audit_exporter.email}"
}

# --- 4. 毎日のエクスポート -------------------------------------
#   outputUriPrefix にバケットだけを渡すと、Firestore が実行時刻の
#   フォルダを自動で切る。毎回別の場所に書かれるので、
#   保持ポリシー（上書き禁止）とぶつからない。
resource "google_cloud_scheduler_job" "audit_export" {
  project   = var.project_id
  region    = var.region
  name      = "audit-log-export"
  schedule  = "0 3 * * *"
  time_zone = "Asia/Tokyo"

  retry_config {
    retry_count = 3
  }

  http_target {
    http_method = "POST"
    uri         = "https://firestore.googleapis.com/v1/projects/${var.project_id}/databases/(default):exportDocuments"
    headers = {
      "Content-Type" = "application/json"
    }
    body = base64encode(jsonencode({
      outputUriPrefix = "gs://${google_storage_bucket.audit_archive.name}"
      collectionIds   = ["auditLogs"]
    }))
    oauth_token {
      service_account_email = google_service_account.audit_exporter.email
      scope                 = "https://www.googleapis.com/auth/datastore"
    }
  }

  depends_on = [
    google_project_service.enabled,
    google_project_iam_member.audit_exporter_firestore,
    google_storage_bucket_iam_member.audit_exporter_bucket,
  ]
}

output "audit_archive_bucket" {
  description = "監査ログのエクスポート先"
  value       = google_storage_bucket.audit_archive.name
}
