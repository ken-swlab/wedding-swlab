###############################################################
# Phase 7 : Cloud Storage for Firebase
#   ★Blaze プラン（従量課金）が必要★
###############################################################

resource "google_storage_bucket" "media" {
  project  = var.project_id
  name     = "${var.project_id}-media"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # 結婚式の写真は復旧不可能なので誤削除から守る
  versioning {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

# GCS バケットを Firebase Storage として登録する
resource "google_firebase_storage_bucket" "media" {
  provider  = google-beta
  project   = var.project_id
  bucket_id = google_storage_bucket.media.name

  depends_on = [google_firebase_project.default]
}

# --- Storage Security Rules ----------------------------------
resource "google_firebaserules_ruleset" "storage" {
  provider = google-beta
  project  = var.project_id

  source {
    files {
      name    = "storage.rules"
      content = file("${path.module}/../storage/storage.rules")
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_firebaserules_release" "storage" {
  provider     = google-beta
  project      = var.project_id
  name         = "firebase.storage/${google_storage_bucket.media.name}"
  ruleset_name = google_firebaserules_ruleset.storage.name

  lifecycle {
    replace_triggered_by = [google_firebaserules_ruleset.storage]
  }

  depends_on = [google_firebase_storage_bucket.media]
}

output "storage_bucket" {
  description = "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET に設定する値"
  value       = google_storage_bucket.media.name
}
