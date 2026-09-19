###############################################################
# エピソード（RAG コンテキスト）用インデックス
#
# 管理画面の一覧は status の等価比較だけで取り、並べ替えは
# JS 側で行っている（インデックス作成を待たずに使えるようにするため）。
# ここで作るのは、この先の取得クエリ用。
###############################################################

# ミニAI の文脈取得:
#   where status == "approved"
#   where visibleToTags array-contains-any [質問者のタグ]
#   orderBy createdAt desc
resource "google_firestore_index" "episodes_visible" {
  provider   = google-beta
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "episodes"

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

# 「このゲストについてのエピソード」:
#   where status == "approved"
#   where targetUids array-contains <uid>
#   orderBy createdAt desc
resource "google_firestore_index" "episodes_target" {
  provider   = google-beta
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "episodes"

  fields {
    field_path = "status"
    order      = "ASCENDING"
  }
  fields {
    field_path   = "targetUids"
    array_config = "CONTAINS"
  }
  fields {
    field_path = "createdAt"
    order      = "DESCENDING"
  }
}
