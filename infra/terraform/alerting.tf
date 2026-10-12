###############################################################
# Issue #104 : GCP 側の異常に気づくためのアラート
#
#   ★ここで拾えるのは GCP のログに出るものだけ★
#     アプリ（Vercel の関数）のログは Cloud Logging に来ない。
#     5xx・レート制限・監査ログの書き込み失敗・パスコードの永久ロックは
#     Sentry のアラートで拾う（docs/ops/alerting.md）。
#
#   ★通知先のメールアドレスは tfvars に書く（Git に入れない）★
#     alert_email が空のうちは、通知チャネルもアラートも作らない。
#     apply のあと、届いた確認メールのリンクを押すまで通知は届かない。
#
#   ★ログの一致で発火する（condition_matched_log）★
#     件数のしきい値ではなく「1件でも出たら知らせる」。どれも平常時には出ないか、
#     オーナー自身の作業（鍵の入れ替え・terraform apply）でしか出ない。
#     身に覚えのない通知が来たら docs/ops/incident-response.md に従う。
###############################################################

variable "alert_email" {
  description = "アラートの通知先メールアドレス。空ならアラートを作らない（terraform.tfvars に書く）"
  type        = string
  default     = ""
}

locals {
  alerts_enabled = var.alert_email != ""

  # 同じ内容の通知を続けて送らない間隔。log-match のアラートには必須
  alert_rate_limit = "3600s"
  alert_auto_close = "604800s"

  activity_log = "logName=\"projects/${var.project_id}/logs/cloudaudit.googleapis.com%2Factivity\""
}

resource "google_monitoring_notification_channel" "owner_email" {
  count        = local.alerts_enabled ? 1 : 0
  project      = var.project_id
  display_name = "Wedding - owner email"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.enabled]
}

# --- 1. 監査ログの毎日のエクスポートが失敗した ---------------------
#   Cloud Scheduler が Firestore の exportDocuments を呼べなかったとき（権限・API の停止など）。
#   ★呼び出しの成否しか分からない★ エクスポート自体は呼び出しのあとに非同期で進む。
#   届いたかどうかは、バケットに当日のフォルダがあるかで確かめる（docs/ops/alerting.md）。
resource "google_monitoring_alert_policy" "audit_export_failed" {
  count        = local.alerts_enabled ? 1 : 0
  project      = var.project_id
  display_name = "Wedding - 監査ログのエクスポートに失敗"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Scheduler の audit-log-export がエラー"
    condition_matched_log {
      filter = join(" AND ", [
        "resource.type=\"cloud_scheduler_job\"",
        "resource.labels.job_id=\"${google_cloud_scheduler_job.audit_export.name}\"",
        "severity>=ERROR",
      ])
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = local.alert_rate_limit
    }
    auto_close = local.alert_auto_close
  }

  notification_channels = [google_monitoring_notification_channel.owner_email[0].name]

  documentation {
    mime_type = "text/markdown"
    content   = "監査ログ（auditLogs）の GCS へのエクスポートを開始できなかった。対応: docs/ops/alerting.md の「監査ログのエクスポート」。"
  }
}

# --- 2. サービスアカウントの鍵が作られた ---------------------------
#   鍵を作るのは、オーナーがローテーションするときだけ（docs/security/rotation-runbook.md）。
#   それ以外で出たら、アカウントが破られた疑いがある。
resource "google_monitoring_alert_policy" "sa_key_created" {
  count        = local.alerts_enabled ? 1 : 0
  project      = var.project_id
  display_name = "Wedding - サービスアカウントの鍵が作られた"
  combiner     = "OR"

  conditions {
    display_name = "CreateServiceAccountKey"
    condition_matched_log {
      filter = join(" AND ", [
        local.activity_log,
        "protoPayload.serviceName=\"iam.googleapis.com\"",
        "protoPayload.methodName=\"google.iam.admin.v1.CreateServiceAccountKey\"",
      ])
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = local.alert_rate_limit
    }
    auto_close = local.alert_auto_close
  }

  notification_channels = [google_monitoring_notification_channel.owner_email[0].name]

  documentation {
    mime_type = "text/markdown"
    content   = "サービスアカウントの鍵が新しく作られた。自分のローテーション作業でなければ、docs/ops/incident-response.md の「封じ込め」へ。"
  }
}

# --- 3. プロジェクトの IAM・監査の設定が変えられた -------------------
#   権限の付与と、Data Access 監査（data_access.tf）の設定は、どちらもプロジェクトの
#   IAM ポリシーに入っている。terraform apply で IAM を変えたときにも通知が来る。
resource "google_monitoring_alert_policy" "project_iam_changed" {
  count        = local.alerts_enabled ? 1 : 0
  project      = var.project_id
  display_name = "Wedding - プロジェクトの IAM・監査設定が変更された"
  combiner     = "OR"

  conditions {
    display_name = "プロジェクトの SetIamPolicy"
    condition_matched_log {
      filter = join(" AND ", [
        local.activity_log,
        "protoPayload.serviceName=\"cloudresourcemanager.googleapis.com\"",
        "protoPayload.methodName=\"SetIamPolicy\"",
      ])
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = local.alert_rate_limit
    }
    auto_close = local.alert_auto_close
  }

  notification_channels = [google_monitoring_notification_channel.owner_email[0].name]

  documentation {
    mime_type = "text/markdown"
    content   = "プロジェクトの権限か、監査ログの設定が変えられた。自分の terraform apply でなければ、docs/ops/incident-response.md の「封じ込め」へ。"
  }
}

output "alerts_enabled" {
  description = "false なら alert_email が未設定で、アラートは作られていない"
  value       = local.alerts_enabled
}
