###############################################################
# Phase 3 : Security Rules / Index / 匿名サインイン
###############################################################

# --- Security Rules ------------------------------------------
# 注意: firebase CLI (firebase deploy --only firestore:rules) で
#       上書きすると Terraform state と乖離する。反映は必ず apply で行う。
resource "google_firebaserules_ruleset" "firestore" {
  provider = google-beta
  project  = var.project_id

  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/../firestore/firestore.rules")
    }
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [google_firestore_database.default]
}

resource "google_firebaserules_release" "firestore" {
  provider     = google-beta
  project      = var.project_id
  name         = "cloud.firestore"
  ruleset_name = google_firebaserules_ruleset.firestore.name

  lifecycle {
    replace_triggered_by = [google_firebaserules_ruleset.firestore]
  }
}

# --- 複合インデックス ----------------------------------------
# usePosts() のクエリ:
#   where status == 'visible'
#   where visibleToTags array-contains-any [...]
#   orderBy createdAt desc
resource "google_firestore_index" "posts_timeline" {
  provider   = google-beta
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "posts"

  fields {
    field_path = "status"
    order      = "ASCENDING"
  }
  fields {
    field_path   = "visibleToTags"
    array_config = "CONTAINS"
  }
  fields {
    field_path = "createdAt"
    order      = "DESCENDING"
  }
}

# --- 匿名サインイン ------------------------------------------
# 招待コードでタグを配る設計にするため、ゲストにアカウント作成を強いない。
# 既に Firebase Console で Auth を初期化済みなら import が必要:
#   terraform import google_identity_platform_config.default <PROJECT_ID>
resource "google_identity_platform_config" "default" {
  provider = google-beta
  project  = var.project_id

  sign_in {
    anonymous {
      enabled = true
    }
  }

  depends_on = [google_firebase_project.default]
}
