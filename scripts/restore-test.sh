#!/usr/bin/env bash
# Firestore の復旧テスト（docs/ops/backup-restore.md §3-5。Issue #104）
#
#   bash scripts/restore-test.sh          PITR から複製 → 件数を比べる → 複製を消す
#   bash scripts/restore-test.sh --keep   複製を消さずに残す（コンソールで中身を見たいとき。あとで必ず消す）
#   bash scripts/restore-test.sh --delete <複製の名前>   --keep で残した複製を消す
#
# ★ (default) には読み取り（件数の集計）しかしない。作る・消すのは restore-YYYYMMDD-HHMM だけ ★
# ★ 表示するのは件数と時間だけ。文書の中身（本名など）は表示しない ★
# プロジェクト ID は gcloud の設定から読む（リポジトリは公開なので、ここに書かない）。
set -euo pipefail

DB_RE='^restore-[0-9]{8}-[0-9]{4}$'
COLLECTIONS="guests guestPrivate guestAdmin posts faces auditLogs"

P="$(gcloud config get-value project 2>/dev/null)"
[ -n "$P" ] || { echo "gcloud のプロジェクトが未設定です（bash scripts/ensure-gcloud-auth.sh）" >&2; exit 1; }

token() { gcloud auth print-access-token; }

delete_db() {  # delete_db <複製の名前>
  [[ "$1" =~ $DB_RE ]] || { echo "消せるのは restore-YYYYMMDD-HHMM だけです: $1" >&2; exit 1; }
  # 複製は、元の削除保護を引き継ぐ。外してからでないと消せない（外すのは複製だけ）
  gcloud firestore databases update --database="$1" --no-delete-protection --project="$P" --quiet >/dev/null
  gcloud firestore databases delete --database="$1" --project="$P" --quiet
  echo "残っているデータベース:"
  gcloud firestore databases list --project="$P" --format='value(name)'
}

count() {  # count <データベース> <コレクション>
  curl -s -X POST \
    -H "Authorization: Bearer $(token)" \
    -H "Content-Type: application/json" \
    "https://firestore.googleapis.com/v1/projects/$P/databases/$1/documents:runAggregationQuery" \
    -d "{\"structuredAggregationQuery\":{\"aggregations\":[{\"alias\":\"n\",\"count\":{}}],\"structuredQuery\":{\"from\":[{\"collectionId\":\"$2\"}]}}}" \
  | grep -o '"integerValue": *"[0-9]*"' | grep -o '[0-9]*' || echo "?"
}

if [ "${1:-}" = "--delete" ]; then
  delete_db "${2:?複製の名前を指定してください}"
  exit 0
fi
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

# 1〜2 時間前の正時（UTC）。PITR の範囲（過去 7 日）に入る
T="$(date -u -d '1 hour ago' +%Y-%m-%dT%H:00:00Z)"
DB="restore-$(date -u +%Y%m%d-%H%M)"
echo "== 復旧テスト  時点: $T  複製先: $DB =="

# 途中で失敗しても、複製（個人情報が入る）を残さない
CREATED=0
cleanup() {
  if [ "$CREATED" = 1 ] && [ "$KEEP" = 0 ]; then
    echo "== 片づけ（複製を消す） =="
    delete_db "$DB" || echo "★ 複製の削除に失敗しました。手で消してください: bash scripts/restore-test.sh --delete $DB ★" >&2
  fi
}
trap cleanup EXIT

echo "== 1. PITR から複製 =="
T0=$SECONDS
CREATED=1
OP="$(gcloud firestore databases clone \
  --source-database="projects/$P/databases/(default)" \
  --snapshot-time="$T" \
  --destination-database="$DB" \
  --project="$P" --format='value(name)')"

# gcloud が完了を待たずに操作（operations/…）を返したときは、終わるまで待つ
if [[ "$OP" == */operations/* ]]; then
  until curl -s -H "Authorization: Bearer $(token)" "https://firestore.googleapis.com/v1/$OP" | grep -q '"done": *true'; do
    [ $((SECONDS - T0)) -lt 3600 ] || { echo "1 時間たっても複製が終わりません" >&2; exit 1; }
    echo "  複製中… $((SECONDS - T0)) 秒"
    sleep 15
  done
fi
CLONE_SEC=$((SECONDS - T0))

echo "== 2. 件数を比べる（元は現在、複製は $T の時点。元より少なくてよい） =="
T1=$SECONDS
for c in $COLLECTIONS; do
  echo "  $c  元: $(count '(default)' "$c")  複製: $(count "$DB" "$c")"
done
CHECK_SEC=$((SECONDS - T1))

T2=$SECONDS
if [ "$KEEP" = 1 ]; then
  echo "== 3. 複製を残しました。見終わったら必ず消す: bash scripts/restore-test.sh --delete $DB =="
else
  trap - EXIT
  echo "== 3. 片づけ（複製を消す） =="
  delete_db "$DB"
fi

echo "== 結果（docs/ops/backup-restore.md §7 に書く） =="
echo "  日付: $(date -u +%Y-%m-%d)  方法: PITR  時点: $T"
echo "  所要時間: 複製 ${CLONE_SEC} 秒・確認 ${CHECK_SEC} 秒・片づけ $((SECONDS - T2)) 秒"
