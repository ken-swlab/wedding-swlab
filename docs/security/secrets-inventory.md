# 秘密情報の一覧（Issue #102）

最終更新: 2026-10-11（コードが参照している名前から作成）

**このファイルに秘密の値は書かない。** 書くのは、名前・置き場所・用途・ローテーションの周期・漏れたときの入口だけ。
手順は [rotation-runbook.md](rotation-runbook.md)、サービスアカウント鍵をなくす方針は [keyless-service-account.md](keyless-service-account.md)、アカウントの保護は [account-checklist.md](account-checklist.md)。

- この一覧は、コード（`process.env.*`・Worker の `env.*`・Modal の Secret）が読む名前から作った。**Vercel・Cloudflare・Modal に実際に何が登録されているかは、Claude からは見えない。**「オーナー確認」と書いた箇所は、管理画面で突き合わせてほしい。
- 秘密を足す・やめるときは、同じ PR でこの一覧も直す。

## 1. 秘密（漏れたら必ずローテーションするもの）

周期は提案値。「当日前」は、披露宴（2027-05-29）の 1 か月前に全部を一度入れ替え、それ以降は当日まで変えない、という意味。

| 名前 | 置き場所 | 用途 | 漏れると | 周期 | 手順 |
|---|---|---|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_B64`（または `_JSON`） | Vercel（Production）。開発機の `app/web/.env.local` にもある可能性（オーナー確認） | サービスアカウント `wedding-app-server` の鍵。Admin SDK（Firestore の全読み書き・Custom Claims・`createCustomToken`）と、未設定時の Vertex AI | **最重要。** Rules を通らずに全ゲストの本名・アレルギー・顔の座標を読め、任意のユーザーになりすませ、管理者権限も付けられる | 90 日 + 当日前。キーレス化できれば廃止 | [runbook §1](rotation-runbook.md#1-サービスアカウント鍵) |
| `GCP_SERVICE_ACCOUNT_B64` | Vercel（設定されていれば。オーナー確認） | Vertex AI 用のサービスアカウント鍵（`/api/admin/ai-test`）。無ければ上の鍵を使う | 上と同じ鍵なら同じ。別の鍵なら、そのサービスアカウントの権限の範囲 | 上と同じ | [runbook §1](rotation-runbook.md#1-サービスアカウント鍵) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Vercel（Production）、開発機の `.env.local`（運用スクリプト用） | R2 の署名付き URL の発行（アップロード）、原本・公開バケットの操作 | 原本（EXIF・位置情報つき）の読み出し、写真の削除・差し替え | 180 日 + 当日前 | [runbook §2](rotation-runbook.md#2-r2-の-api-トークン) |
| `WORKER_WEBHOOK_SECRET`（Vercel）⇔ `WEBHOOK_SECRET`（Worker） | Vercel（Production）と、Cloudflare Worker `wedding-exif-stripper` の Secret。**同じ値の対** | Worker → `/api/hooks/original-published` の認証（`x-worker-secret`） | 任意の原本を「公開済み」として通知でき、投稿の写真の状態を書き換えられる | 180 日 + 当日前 | [runbook §3](rotation-runbook.md#3-worker-の-webhook-の秘密) |
| `REKOGNITION_ACCESS_KEY_ID` / `REKOGNITION_SECRET_ACCESS_KEY`（無ければ `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`） | Vercel（Production） | AWS Rekognition（顔の検出・照合） | 顔コレクションの読み出し・削除、AWS の課金 | 90 日 + 当日前 | [runbook §4](rotation-runbook.md#4-aws-rekognition-のアクセスキー) |
| `MODAL_TTS_TOKEN`（Vercel）⇔ `SBV2_TTS_TOKEN`（Modal の Secret `sbv2-auth`） | Vercel と Modal。**同じ値の対** | 音声合成エンドポイントの認証（`x-tts-token`） | GPU を外から使われる（課金） | 180 日 + 当日前 | [runbook §5](rotation-runbook.md#5-音声合成modalのトークン) |
| `SENTRY_AUTH_TOKEN` | Vercel（ビルド時だけ使う） | ソースマップのアップロード | Sentry のリリース・ソースマップの改ざん。権限が広いトークンなら、エラーイベントの読み出しも | 180 日 | [runbook §6](rotation-runbook.md#6-sentry-のトークン) |
| `SENTRY_READ_TOKEN` | 置かない（`scripts/csp-reports.py` の実行時に入力）。環境変数で渡すこともできる | CSP 違反レポートの読み取り | エラーイベント（伏せ字処理済み）の読み出し | 180 日 | [runbook §6](rotation-runbook.md#6-sentry-のトークン) |
| `WEDDING_PASSCODE` | Vercel（Production） | 招待状のパスコード（`/api/guest/passcode`） | 招待されていない人が登録の手前まで進める（承認は別に要る） | 定期には変えない（招待状に印刷するため）。漏れたときだけ | [runbook §7](rotation-runbook.md#7-パスコードと招待コード) |
| `INVITE_CODES_JSON` | Vercel（`ENABLE_INVITE_CODES` が有効なとき） | 招待コードと、付けるタグの対応 | コードを知った人が、そのタグで入れる | 定期には変えない。漏れたときだけ | [runbook §7](rotation-runbook.md#7-パスコードと招待コード) |
| `AUDIT_IP_SALT` | Vercel（Production） | 監査ログの IP を HMAC で仮名化する鍵 | 監査ログの `ipHash` から IP を総当たりで割り出せる | **変えない**（変えると、前後の `ipHash` を突き合わせられなくなる）。漏れたときだけ | [runbook §8](rotation-runbook.md#8-監査ログの-ip-の-salt) |

## 2. コードの外にある資格情報（アカウントと CLI）

コードは読まないが、破られると上の秘密をすべて取り出せる・入れ替えられる。保護は [account-checklist.md](account-checklist.md)。

| 資格情報 | 置き場所 | できること | 管理 |
|---|---|---|---|
| Google アカウント（GCP・Firebase のオーナー） | オーナー本人 | すべて（鍵の発行、Rules、データ） | MFA。Owner / Editor を日常で使わない |
| `gcloud` のログインと ADC | Codespaces のホーム（`scripts/ensure-gcloud-auth.sh` で更新） | Terraform の `plan` / `apply`、運用スクリプト | 長く使わないときは `gcloud auth revoke` と `gcloud auth application-default revoke` |
| Terraform の state（`infra/terraform/terraform.tfstate`） | ローカル（Git に入れない） | 構成の全体像。鍵は入れていない（`service_account.tf` の ★） | サービスアカウントの鍵を Terraform で作らない |
| GitHub アカウント・`gh` のトークン | オーナー本人、Codespaces | `main` への push = 本番デプロイ | MFA、ブランチ保護、Secret scanning と Push protection |
| Vercel アカウント・CLI のトークン | オーナー本人、Codespaces（`.vercel/`） | 環境変数の読み書き、デプロイ、Firewall | MFA。トークンの棚卸し |
| Cloudflare アカウント・`wrangler` のログイン・API トークン | オーナー本人、Codespaces | DNS、R2、Worker とその Secret | MFA。トークンは用途ごとに最小の権限 |
| LINE Developers（チャネル・LIFF） | オーナー本人 | LIFF の設定変更（エンドポイント URL の差し替え = ログインの乗っ取り） | MFA。Channel Secret は下の注 |
| Sentry・Modal・AWS のアカウント | オーナー本人 | トークン・鍵の発行、データの閲覧 | MFA |

**LINE の Channel Secret について:** このアプリは使っていない。ログインは LINE の ID トークンを `https://api.line.me/oauth2/v2.1/verify` に `client_id`（チャネル ID）を付けて検証するだけで、Secret を送らない。Vercel に `LINE_CHANNEL_SECRET` のような変数があれば、どこからも読まれていないので消してよい（オーナー確認）。Secret 自体は LINE Developers のコンソールにあり、再発行の手順は [runbook §9](rotation-runbook.md#9-line-の-channel-secret)。

## 3. 秘密ではない設定（ローテーション不要）

値を知られても、それだけでは何もできない。ここに並べるのは、秘密と取り違えないため。

| 名前 | 中身 | 注意 |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` ほか `NEXT_PUBLIC_FIREBASE_*` | Firebase のクライアント設定 | ブラウザに配る前提の値。守りは Rules と Custom Claims。ただし API キーには、Google Cloud のコンソールで「HTTP リファラー」と「使える API」の制限を付けておく（オーナー確認） |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry の送信先 | 知られると偽のイベントを送られる。困ったら Sentry で DSN を作り直す（再デプロイが要る。CSP の報告先も DSN から作る） |
| `NEXT_PUBLIC_LIFF_ID`・`LINE_CHANNEL_ID` | LIFF とチャネルの ID | 公開の値 |
| `R2_ACCOUNT_ID`・`R2_BUCKET_PUBLIC`・`R2_BUCKET_PRIVATE`・`R2_PUBLIC_BASE`・`R2_PUBLIC_BASE_LEGACY`・`R2_PRESIGN_TTL`・`NEXT_PUBLIC_MEDIA_BASE`・`NEXT_PUBLIC_MEDIA_LEGACY_HOSTS` | R2 の場所と設定 | |
| `GCP_PROJECT_ID`・`GCP_LOCATION`・`VERTEX_MODEL`・`VERTEX_MAX_OUTPUT_TOKENS`・`VERTEX_THINKING_BUDGET` | Vertex AI の設定 | |
| `REKOGNITION_REGION`（`AWS_REGION`）・`REKOGNITION_COLLECTION_ID` | Rekognition の設定 | |
| `MODAL_TTS_URL`・`MODAL_TTS_TIMEOUT_MS` | 音声合成の URL | URL は公開されている。守りはトークン |
| `SENTRY_ORG`・`SENTRY_PROJECT` | ソースマップの送り先 | |
| `ENABLE_INVITE_CODES`・`AUDIT_FAIL_OPEN`・`NEXT_PUBLIC_SCREEN_TAGS`・`NEXT_PUBLIC_FIREBASE_EMULATOR` | 機能の切り替え | `AUDIT_FAIL_OPEN` は監査ログが書けないときの動きを変える。本番で有効にするときは理由を残す |
| Worker の `[vars]`（`wrangler.toml`） | `WEBHOOK_URL`・`PUBLIC_BASE`・上限値 | リポジトリに入っている。秘密は `wrangler secret put` だけ |

## 4. 秘密の置き場所の決まり

- 本番の秘密は **Vercel の環境変数（Production。種類は Sensitive）**、Worker の秘密は `wrangler secret put`、Modal の秘密は `modal secret` に置く。コード・コミット・Issue・ログ・Sentry には書かない（CLAUDE.md のルール 3・4）。
- Preview と Development の環境には、本番の秘密を入れない（Preview はどのブランチのコードでも動く）。
- 開発機の `app/web/.env.local` には、運用スクリプトに要るものだけを置く。サービスアカウントの鍵は置かず、ADC（`gcloud auth application-default login`）を使う（`firebase-admin.ts` と運用スクリプトは、鍵が無ければ ADC を使う）。
- 混入の検査は CI の gitleaks（PR の差分と、毎週の履歴全体。`.github/workflows/security.yml`）。検出されたら、先に [rotation-runbook.md](rotation-runbook.md) の「漏れたとき」を行う。

## 5. 棚卸しの記録

四半期に一度と、披露宴の 1 か月前に、オーナーが管理画面と突き合わせる。

| 日付 | 確認した人 | 結果（増減・失効させたもの。値は書かない） |
|---|---|---|
| | | |
