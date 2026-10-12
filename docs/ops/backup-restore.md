# バックアップと復旧（Issue #104）

最終更新: 2026-10-12

データを失ったとき・壊されたときに、どこまで・どうやって戻せるか。**ここに書いた操作は、すべてオーナーが実行する**（Claude Code がしてよいのは、読み取りの確認と `terraform plan` まで）。

このリポジトリは公開されている。プロジェクト ID・連絡先・個人情報をこのファイルに書かない（コマンドの `<PROJECT_ID>` は実行時に置き換える）。

## 1. いまの状態（2026-10-12 に `gcloud` の読み取りで確認）

| 対象 | 守り | 状態 |
|---|---|---|
| Firestore（全コレクション） | PITR（過去 7 日の任意の時点。分単位） | **有効**（`infra/terraform/firebase.tf`）。いちばん古い時点は 7 日前 |
| Firestore | 定期バックアップ | **有効**（2026-10-12 に apply。日次・7 日保持と、週次・14 週保持。`infra/terraform/backup.tf`） |
| Firestore | 誤削除の防止 | 削除保護が有効。Terraform は `prevent_destroy` |
| 監査ログ（`auditLogs`） | 毎日 03:00（JST）に GCS へエクスポート。保持 400 日 | 動いている（直近まで毎日のフォルダがある）。**保持ポリシーはロック済み**（§5） |
| 個人情報の閲覧ログ（Cloud Logging の `pii-access`） | 保持 400 日 | 有効。**ロックはしていない**（§5） |
| Firebase Storage のバケット（旧。`<PROJECT_ID>-media`） | バージョニング、削除後 7 日の復元（soft delete） | 有効。写真は R2 に移っている |
| R2（`wedding-originals`・`wedding-media`） | **バックアップ無し** | §4 |
| Terraform の state | ローカルのファイルだけ | §6 |

## 2. 目安（RPO / RTO）

RPO は「どの時点まで戻せるか（失ってよいデータの幅）」、RTO は「戻すのにかかる時間」。

| 起きたこと | 戻す手段 | RPO | RTO |
|---|---|---|---|
| 誤操作・不正な一括更新・一部の削除に、7 日以内に気づいた | PITR で直前の時点を別のデータベースに複製 → 必要な文書を書き戻す | 分単位（ほぼ 0） | 複製は**約 12 分**（2026-10-12 の復旧テスト。文書は数百件）。書き戻しの作業時間は未計測 |
| 7 日より前の破損に、あとから気づいた | 週次バックアップから別のデータベースに復元 → 書き戻す | 最長 7 日（週次の間隔）。14 週より前は戻せない | 未計測 |
| データベースごと失った | 日次バックアップから復元 | 最長 24 時間 | 未計測 |
| 原本・公開の写真（R2）を失った | **戻せない**（公開バケットだけ失ったなら、原本から作り直せる。§4） | — | — |

- 披露宴の当日は、投稿が数時間に集中する。当日の RPO は、PITR（分単位）に頼る。
- PITR も定期バックアップも、**復元先は新しいデータベース**で、`(default)` をその場で巻き戻す機能ではない。アプリは `(default)` を読むので、戻すには「書き戻す」作業が要る（§3-3）。

## 3. Firestore の復旧

準備（共通）:

```bash
bash scripts/ensure-gcloud-auth.sh
P="<PROJECT_ID>"
```

### 3-1. PITR から複製する（7 日以内）

```bash
# 戻したい時点（UTC。秒は 00 にする。過去 7 日以内）
T="2026-10-12T03:00:00Z"
DB="restore-$(date -u +%Y%m%d-%H%M)"

time gcloud firestore databases clone \
  --source-database="projects/$P/databases/(default)" \
  --snapshot-time="$T" \
  --destination-database="$DB" \
  --project="$P"
```

- `(default)` には何も起きない。新しいデータベース `$DB` ができる（同じリージョン）。
- `time` の結果を、§7 の記録に書く。

### 3-2. バックアップから復元する（7 日より前、またはデータベースを失ったとき）

```bash
gcloud firestore backups list --project="$P"     # バックアップの名前と時点を見る
DB="restore-$(date -u +%Y%m%d-%H%M)"

time gcloud firestore databases restore \
  --source-backup="<backups list に出た名前（projects/…/locations/…/backups/…）>" \
  --destination-database="$DB" \
  --project="$P"
```

### 3-3. 中身を確かめる・書き戻す

**件数を比べる**（複製が成功したことの最低限の確認）:

```bash
count() {  # count <データベース> <コレクション>
  curl -s -X POST \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "Content-Type: application/json" \
    "https://firestore.googleapis.com/v1/projects/$P/databases/$1/documents:runAggregationQuery" \
    -d "{\"structuredAggregationQuery\":{\"aggregations\":[{\"alias\":\"n\",\"count\":{}}],\"structuredQuery\":{\"from\":[{\"collectionId\":\"$2\"}]}}}" \
  | grep -o '"integerValue": *"[0-9]*"'
}
for c in guests guestPrivate guestAdmin posts faces auditLogs; do
  echo "$c  元: $(count '(default)' $c)  複製: $(count "$DB" $c)"
done
```

- 件数だけを表示する（本名などの中身は表示しない）。複製の時点が過去なので、元より少なくてよい。
- Firebase のコンソールで `$DB` を開き、文書を数件、目で見る。

**書き戻す**（実際の事故のとき。**まだ試していない。**復旧テストでは行わない）:

- 一部の文書だけ: コンソールか、その場で書くスクリプトで、`$DB` から読んで `(default)` に書く。書き戻す範囲（コレクション・文書 ID）を先に決め、ほかの人の新しい投稿を上書きしない。
- 全体: `$DB` を GCS にエクスポートし、`(default)` にインポートする。インポートは、同じ ID の文書を上書きし、エクスポートに無い文書は消さない。

  ```bash
  gcloud firestore export "gs://<一時バケット>/restore" --database="$DB" --project="$P"
  gcloud firestore import "gs://<一時バケット>/restore/<出力のフォルダ>" --database="(default)" --project="$P"
  ```

  一時バケットには個人情報が入る。終わったら消す。監査ログのバケット（ロック済み）は使わない（400 日消せなくなる）。
- 書き戻す前に、`cd app/web && node scripts/ops.mjs maintenance on` で API を止める。**ただし、ブラウザから Firestore に直接書く操作（文字だけの投稿・コメント・いいね）は止まらない**（[incident-response.md](incident-response.md) §3）。書き戻す範囲にそれらが含まれるときは、人の少ない時間に行い、書き戻しの前後で件数を見る。
- Custom Claims（`tags`・`admin`）は Firebase Auth にあり、Firestore の復旧では戻らない。`guests` のタグと食い違ったら、管理画面でタグを保存し直す（`applyGuestTags()` が Claims を付け直す）。

### 3-4. 片づける（必ず）

複製したデータベースには、**全ゲストの本名・アレルギー・顔の座標が入っている。** 用が済んだらすぐ消す。

```bash
gcloud firestore databases update --database="$DB" --no-delete-protection --project="$P"
gcloud firestore databases delete --database="$DB" --project="$P"
gcloud firestore databases list --project="$P"   # (default) だけになったことを確かめる
```

- **複製は、元の削除保護を引き継ぐ。**外してからでないと消せない（2026-10-12 の復旧テストで分かった）。
- **外す・消すのは `$DB` だけ。** `(default)` を指定しない。

### 3-5. 復旧テスト（オーナー。受け入れ条件）

3-1 → 3-3 の「件数を比べる」→ 3-4 を、本番のプロジェクトで 1 回行う（別のプロジェクトは要らない。`(default)` には触れない）。日付・所要時間・結果を §7 に書く。

`bash scripts/restore-test.sh` が、この 3 つを続けて行う（途中で失敗しても複製を消す。`--keep` で残し、`--delete <複製の名前>` で消す）。表示するのは件数と時間だけ。定期バックアップを apply したあと、最初のバックアップができたら（翌日）、3-2 も 1 回試す。

繰り返すのは、披露宴の 1 か月前と、データの形を大きく変えたあと。

## 4. R2（写真）の方針

**現状**

- `wedding-originals`（非公開）: ゲストが上げた原本（EXIF・位置情報つき）。アプリも Worker も、原本を消さない・動かさない（Worker は印（マーカー）を置くだけ。CLAUDE.md のルール 18）。
- `wedding-media`（公開）: サムネイルと、Worker が EXIF を落とした高画質版。**原本があれば作り直せる。**
- R2 には、オブジェクトのバージョニングが無い。**バケットの設定（保持のルール・ライフサイクル）とオブジェクト数は、Claude からは見えない（オーナー確認）。**
- 写真は作り直せない。いちばんの危険は、R2 の API トークン（読み書き）が漏れて、原本を消されること。Cloudflare のアカウントが破られても同じ。

**案（未決定。オーナーが決める）**

| 案 | 内容 | 良い点 | 気になる点 |
|---|---|---|---|
| A. 何もしない | いまのまま | 手間も費用も無い | 原本を消されたら終わり |
| B. 原本を別の場所へ定期的に複製する | `rclone` などで、`wedding-originals` を、別の資格情報でしか書けない場所（別の R2 バケット＋別トークン、または GCS）へ。複製先は追記だけ | アプリのトークンが漏れても、複製は残る | 位置情報つきの原本が 2 か所になる。削除依頼のとき、両方から消す手順が要る（Issue #105）。複製を回す場所と資格情報が増える |
| C. `wedding-originals` に保持のルール（Bucket Lock）を付ける | 一定の期間、上書きと削除を禁止する | 複製なしで、消されることを防げる | 期間中は、削除依頼にも応じられない。Worker のマーカー（`_failed/`・`_pending/` は消す）と同じバケットなので、接頭辞を限れるかの確認が要る |

提案: **招待状を配る前に B か C を決める。**それまでは A（テストの写真しか無い）。当日の直後に、原本をまとめて 1 回、手元（オフライン）へ退避するのは、どの案でも行う。

## 5. ログの保管とロックの状況（2026-10-12 確認）

| バケット | 保持 | ロック | メモ |
|---|---|---|---|
| 監査ログ（GCS `<PROJECT_ID>-audit-archive`） | 400 日 | **ロック済み**（2026-09-25 から。取り消せない） | エクスポートは毎日届いている。Terraform の `audit_bucket_locked` の default を、実機に合わせて `true` にした（それまでは tfvars だけが `true` で、tfvars を失うと apply が失敗する状態だった） |
| 個人情報の閲覧ログ（Cloud Logging `pii-access`） | 400 日 | **ロックしていない** | `data_access.tf` の 3 段階のうち、第 2 段階（`pii_access_minimize`）も第 3 段階（ロック）も、コードの default は `false`。進めるかどうかは未決定（オーナー） |

- 閲覧ログをロックする前に、第 2 段階（ゲスト本人の読み取りを捨て、`_Default` から外す）を済ませる。順番を飛ばすと、全員の LINE 表示名が入ったログを 400 日消せなくなる（`data_access.tf` の冒頭）。
- ロックは取り消せない。進めるときは、default を書き換えてコミットし、オーナーが apply する（`.claude/rules/infra.md`）。

## 6. Terraform の state

**現状:** `infra/terraform/terraform.tfstate` は、開発機（Codespaces）のローカルにだけある（Git に入れていない）。サービスアカウントの鍵は入っていないが、構成の全体が入っている。**Codespaces を消すと、state も消える。** 消えると、既存のリソースを 1 つずつ `terraform import` し直すことになる。

**案（未決定。オーナーが決める）**

| 案 | 内容 |
|---|---|
| A. GCS のリモート state | state 用のバケットを `gcloud` で作る（バージョニング有効・公開禁止・均一なアクセス制御。暗号化は Google の既定で有効）→ `main.tf` に `backend "gcs"` を足す → `terraform init -migrate-state`。ロックもバケットが担う |
| B. ローカルのまま、写しを取る | apply のたびに、state をパスワードマネージャーか、暗号化した保管場所に写す |

提案: **A。**作業は 30 分ほどで、戻すのも `-migrate-state` でできる。やると決めたら、Claude Code が `backend` の PR を出し、バケットの作成と `init -migrate-state` はオーナーが行う。それまでは、apply のあとに state の写しを 1 つ取っておく。

## 7. 記録

### 復旧テスト

| 日付 | 方法（PITR／バックアップ） | 所要時間（複製・確認・片づけ） | 結果（件数が合ったか。気づいたこと） | 実行した人 |
|---|---|---|---|---|
| 2026-10-12 | PITR（1 時間あまり前の時点） | 複製 約 12 分・確認 数秒・片づけ 1 分未満 | **成功。**6 コレクション（`guests`・`guestPrivate`・`guestAdmin`・`posts`・`faces`・`auditLogs`）の件数が合った（`posts` は、時点のあとに増えた 1 件ぶんだけ複製が少ない）。片づけは最初、削除保護を引き継いでいて失敗し、外してから消した（§3-4 を直した）。コンソールでの目視と、書き戻しはしていない | オーナー（`scripts/restore-test.sh`。片づけは、オーナーの指示で Claude Code） |

### 状態の確認

| 日付 | 確認した人 | 結果 |
|---|---|---|
| 2026-10-12 | Claude Code（`gcloud` の読み取り） | 定期バックアップ 0 件、監査ログのバケットはロック済み、閲覧ログのバケットは未ロック |
| 2026-10-12（apply のあと） | Claude Code（`gcloud` の読み取り） | バックアップのスケジュールが 2 つある（7 日保持・14 週保持）。復旧テストのあと、データベースは `(default)` だけ |
