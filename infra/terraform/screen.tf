###############################################################
# Phase 7.5 : プロジェクター投影ビュー (/screen) 用インデックス
###############################################################

# useScreenData のコメント購読クエリ:
#   collectionGroup("comments")
#   where visibleToTags array-contains-any SCREEN_TAGS
#   orderBy createdAt desc
#
# ★query_scope は COLLECTION_GROUP★
#   既定の COLLECTION スコープではコレクショングループクエリに使われない。
resource "google_firestore_index" "comments_stream" {
  provider    = google-beta
  project     = var.project_id
  database    = google_firestore_database.default.name
  collection  = "comments"
  query_scope = "COLLECTION_GROUP"

  fields {
    field_path   = "visibleToTags"
    array_config = "CONTAINS"
  }
  fields {
    field_path = "createdAt"
    order      = "DESCENDING"
  }
}
