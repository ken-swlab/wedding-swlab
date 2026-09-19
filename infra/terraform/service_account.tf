###############################################################
# Phase 4 : サーバー実行用サービスアカウント
#
# ★ google_service_account_key はここでは作らない ★
#   秘密鍵が平文で tfstate に保存されてしまうため。
#   鍵の発行は gcloud で行い、Vercel の環境変数に直接入れる。
#   （将来的には Workload Identity Federation で鍵レス化するのが理想）
###############################################################

resource "google_service_account" "app_server" {
  project      = var.project_id
  account_id   = "wedding-app-server"
  display_name = "Wedding SNS/CTF - Next.js server runtime"
  description  = "Vercel の Route Handler から Admin SDK を実行するための SA"
}

locals {
  app_server_roles = [
    # setCustomUserClaims / verifyIdToken(checkRevoked) / getUser
    "roles/firebaseauth.admin",
    # Firestore の読み書き（Security Rules はバイパスされる）
    "roles/datastore.user",
  ]
}

resource "google_project_iam_member" "app_server" {
  for_each = toset(local.app_server_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app_server.email}"
}

output "app_server_service_account_email" {
  description = "Vercel 用サービスアカウントのメールアドレス"
  value       = google_service_account.app_server.email
}
