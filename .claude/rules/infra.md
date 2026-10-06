---
paths:
  - "infra/**"
  - "scripts/**"
  - "app/web/scripts/**"
  - "app/web/test-rekognition.mjs"
  - "firebase.json"
  - ".devcontainer/**"
---

# インフラと運用スクリプト

## Terraform（infra/terraform）
- state はローカル（Git に入らない）。Claude がしてよいのは `terraform fmt` / `validate` / `plan` まで。`apply` はオーナーが実行するので、PR に手順と影響を書く。GCP を触る前に `bash scripts/ensure-gcloud-auth.sh`（`source` しない）。
- Terraform が反映するもの: Firestore の Rules（`infra/firestore/firestore.rules` を読み込む）・複合インデックス・TTL、`auditLogs` の毎日の GCS エクスポート（Cloud Scheduler）、Data Access ログ、アプリ用サービスアカウントと IAM。`firebase deploy` は使わない（state と食い違い、Terraform 管理のインデックスを消しかねない）。
- 取り消せない変数: `audit_bucket_locked`（audit.tf）と `pii_access_bucket_locked`（data_access.tf）。`pii_access_minimize` にも段階の手順がある（data_access.tf の冒頭）。この3つの default は勝手に変えない。段階を進めるときは tfvars ではなく default を書き換えてコミットする決まり。
- `prevent_destroy` を外さない。`firestore_location` を変えない。Firestore の `DATA_WRITE` 監査を有効にしない（書いた値がログに複製され、削除依頼に応えられなくなる）。
- サービスアカウントの鍵を Terraform で作らない（state に平文で残る）。
- R2 のバケット・カスタムドメイン・DNS、Vercel、Cloudflare の設定は Terraform 管理外（オーナーが手で管理）。

## Cloudflare Worker（infra/workers/exif-stripper）
- 確認は `npm run typecheck`。デプロイ（`npm run deploy`）と `wrangler secret put WEBHOOK_SECRET` はオーナー。
- `WEBHOOK_URL` は本番ドメイン（`https://wedding.sw-lab.net/api/hooks/original-published`）。`*.vercel.app` の URL にしない。
- webhook の応答が 3xx・401/403/404/429 などのときは全体障害とみなして処理を止める作り。Vercel Firewall のルールが webhook を弾くと処理が止まる。
- 無料プランのサブリクエスト上限に合わせて `SUBREQUEST_BUDGET`（45）と `MAX_PER_RUN` を決めている。

## Modal（infra/modal）
- 音声合成（Style-Bert-VITS2、T4 GPU）。`x-tts-token` で認証。`min_containers=1` は当日だけ（GPU は常時課金になる）。

## スクリプト
| 種類 | スクリプト |
|---|---|
| 読み取りだけ | `scripts/csp-verify.py`、`scripts/csp-reports.py`（Sentry の読み取りトークンが要る）、`scripts/pii-access-report.py`（gcloud）、`scripts/infra-verify.sh`（Vercel・Cloudflare のログインが要る）、`scripts/inspect-markers.mjs`、`app/web/scripts/ops.mjs audit` / `ratelimit` / `maintenance status`、`app/web/scripts/scan-published-metadata.mjs`（`--apply` なし） |
| 本番を変える（オーナーの指示があるときだけ） | `ops.mjs maintenance on` / `off`（約10秒で全ゲストに反映）、`make-admin.mjs`、`migrate-pii.mjs --copy --apply` / `--purge --apply`（`--purge` は取り消し不可で、本名入りのバックアップ JSON を書き出す）、`migrate-posts-face-status.mjs`（既定で書き込む）、`scan-published-metadata.mjs --apply`（公開バケットの上書き。取り消せない。あとで Cloudflare の Purge が要る） |
| 課金が発生する | `app/web/test-rekognition.mjs`（AWS Rekognition を呼ぶ） |

- `app/web/scripts/*.mjs` は `app/web` で実行する（`.env.local` の鍵、無ければ ADC を使う）。
- Vercel の環境変数（`vercel env`）と Firewall（`vercel firewall`）の変更はオーナー。`NEXT_PUBLIC_*` を変えたら再デプロイが要る。
