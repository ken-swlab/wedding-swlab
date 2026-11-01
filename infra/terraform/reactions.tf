###############################################################
# 自分のいいねの一覧（Issue #212）
###############################################################

# MyReactionsContext（app/web/src/components/guestbook/MyReactionsContext.tsx）のクエリ:
#   collectionGroup("reactions")
#   where uid == 自分の uid
#   limit 500
#
# ★query_scope が COLLECTION_GROUP の単一フィールドインデックスが要る★
#   自動で作られる単一フィールドインデックスは COLLECTION スコープだけで、
#   コレクショングループのクエリには使われない（無いとクエリが FAILED_PRECONDITION で失敗する）。
# ★index_config を書くと、この項目の自動のインデックスは書いたものだけに置き換わる★
#   COLLECTION スコープの昇順・降順も残す（posts/{id}/reactions の uid での並べ替え・絞り込みを壊さない）。
#
# ★Rules（match /{path=**}/reactions）と一緒に apply する★ どちらが欠けても一覧は読めない
#   （アプリは読めないときに今までの動き＝白いハートから始める、に戻る）。
resource "google_firestore_field" "reactions_uid" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "reactions"
  field      = "uid"

  index_config {
    indexes {
      order       = "ASCENDING"
      query_scope = "COLLECTION"
    }
    indexes {
      order       = "DESCENDING"
      query_scope = "COLLECTION"
    }
    indexes {
      order       = "ASCENDING"
      query_scope = "COLLECTION_GROUP"
    }
  }
}
