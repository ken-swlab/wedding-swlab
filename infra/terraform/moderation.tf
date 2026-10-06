###############################################################
# 投稿の非表示（Issue #68）用インデックス
###############################################################

# マイページの「非表示になったコメント」（src/hooks/useMyHiddenItems.ts）:
#   collectionGroup("comments")
#   where authorUid == 自分
#   where hidden == true
#
# ★query_scope は COLLECTION_GROUP★
#   コレクショングループのクエリは、単一フィールドの自動インデックスが使えない
#   （COLLECTION スコープにしか作られない）ので、等価条件だけでも複合インデックスが要る。
resource "google_firestore_index" "comments_hidden_by_author" {
  provider    = google-beta
  project     = var.project_id
  database    = google_firestore_database.default.name
  collection  = "comments"
  query_scope = "COLLECTION_GROUP"

  fields {
    field_path = "authorUid"
    order      = "ASCENDING"
  }
  fields {
    field_path = "hidden"
    order      = "ASCENDING"
  }
}
