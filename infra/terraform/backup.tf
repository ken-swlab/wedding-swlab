###############################################################
# Issue #104 : Firestore の定期バックアップ
#
#   PITR（firebase.tf。過去7日の任意の時点）に加えて、日次と週次のバックアップを持つ。
#     - PITR      : 直近7日の誤操作・不正な一括更新を、分単位の時点まで戻す
#     - 日次（7日）: PITR と同じ期間を、データベースごと別の写しとして持つ
#     - 週次（14週）: 7日より前に起きて、あとから気づいた破損に備える
#   復旧の手順と確認の記録は docs/ops/backup-restore.md。
#
#   ★バックアップには個人情報（guestPrivate の本名・アレルギーなど）が入る★
#     削除依頼に応じて本体から消しても、バックアップには最長14週残る。
#     保持を延ばすときは、この点をプライバシーポリシー（Issue #105）と合わせる。
#     14週は、このサービスで選べる上限でもある。
#
#   ★バックアップからの復元先は、必ず新しいデータベース★
#     既存の (default) を上書きする操作ではない。戻し方は docs を見る。
###############################################################

resource "google_firestore_backup_schedule" "daily" {
  project  = var.project_id
  database = google_firestore_database.default.name

  retention = "604800s" # 7日

  daily_recurrence {}
}

resource "google_firestore_backup_schedule" "weekly" {
  project  = var.project_id
  database = google_firestore_database.default.name

  retention = "8467200s" # 14週

  weekly_recurrence {
    day = "SUNDAY"
  }
}
