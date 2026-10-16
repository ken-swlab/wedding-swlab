# 秘密情報の一覧（Issue #102）

最終更新: 2026-10-12（コードが参照している名前から作成。同日にオーナーが Vercel・GCP の実機と突き合わせた内容を反映した）

**このファイルに秘密の値は書かない。** 書くのは、名前・置き場所・用途・ローテーションの周期・漏れたときの入口だけ。
手順は [rotation-runbook.md](rotation-runbook.md)、サービスアカウント鍵をなくす方針は [keyless-service-account.md](keyless-service-account.md)、アカウントの保護は [account-checklist.md](account-checklist.md)。

- この一覧は、コード（`process.env.*`・Worker の `env.*`・Modal の Secret）が読む名前から作った。**Vercel・Cloudflare・Modal に実際に何が登録されているかは、Claude からは見えない。**
- 「2026-10-12 確認」と書いた箇所は、オーナーが Vercel の管理画面と API で確かめた内容。「オーナー確認」と書いた箇所は、まだ突き合わせていない。
- 秘密を足す・やめるときは、同じ PR でこの一覧も直す。

## 1. 秘密（漏れたら必ずローテーションするもの）

周期は提案値。「当日前」は、披露宴（2027 年 5 月）の 1 か月前に全部を一度入れ替え、それ以降は当日まで変えない、という意味。

| 名前 | 置き場所（Vercel の種別・環境） | 用途 | 漏れると | 周期 | 手順 |
|---|---|---|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_B64` | Vercel（Sensitive・Production のみ。2026-10-12 確認）。開発機の `app/web/.env.local` からは 2026-10-12 に消した | サービスアカウント `firebase-adminsdk-fbsvc` の鍵（下の注）。Admin SDK（Firestore の全読み書き・Custom Claims・`createCustomToken`）と Vertex AI（`/api/admin/ai-test`） | **最重要。** Rules を通らずに全ゲストの本名・アレルギー・顔の座標を読め、任意のユーザーになりすませ、管理者権限も付けられる | 90 日 + 当日前。キーレス化できれば廃止 | [runbook §1](rotation-runbook.md#1-サービスアカウント鍵) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Vercel（Sensitive・Production のみ。2026-10-12 確認）。開発機の `.env.local` にもある（§4 の見直し） | R2 の署名付き URL の発行（アップロード）、原本・公開バケットの操作 | 原本（EXIF・位置情報つき）の読み出し、写真の削除・差し替え | 180 日 + 当日前 | [runbook §2](rotation-runbook.md#2-r2-の-api-トークン) |
| `WORKER_WEBHOOK_SECRET`（Vercel）⇔ `WEBHOOK_SECRET`（Worker） | Vercel（Sensitive・Production のみ。2026-10-12 確認）と、Cloudflare Worker `wedding-exif-stripper` の Secret。**同じ値の対** | Worker → `/api/hooks/original-published` の認証（`x-worker-secret`） | 任意の原本を「公開済み」として通知でき、投稿の写真の状態を書き換えられる | 180 日 + 当日前 | [runbook §3](rotation-runbook.md#3-worker-の-webhook-の秘密) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Vercel（Sensitive・Production のみ。2026-10-12 確認）。開発機の `.env.local` にもある（§4 の見直し） | AWS Rekognition（顔の検出・照合）。コードは `REKOGNITION_ACCESS_KEY_ID` / `REKOGNITION_SECRET_ACCESS_KEY` があれば先に読むが、実機で確かめたのは `AWS_*` のほう（`REKOGNITION_*` の登録の有無はオーナー確認） | 顔コレクションの読み出し・削除、AWS の課金 | 90 日 + 当日前 | [runbook §4](rotation-runbook.md#4-aws-rekognition-のアクセスキー) |
| `MODAL_TTS_TOKEN`（Vercel）⇔ `SBV2_TTS_TOKEN`（Modal の Secret `sbv2-auth`） | Vercel（Sensitive・Production のみ。2026-10-12 確認）と Modal。**同じ値の対**。開発機の `.env.local` にもある（§4 の見直し） | 音声合成エンドポイントの認証（`x-tts-token`） | GPU を外から使われる（課金） | 180 日 + 当日前 | [runbook §5](rotation-runbook.md#5-音声合成modalのトークン) |
| `SENTRY_AUTH_TOKEN` | Vercel（Sensitive・Production。ビルド時だけ使う。2026-10-12 に新しいトークンへ差し替え、古い個人用トークンは Sentry で失効済み） | ソースマップのアップロード | Sentry のリリース・ソースマップの改ざん。権限が広いトークンなら、エラーイベントの読み出しも | 180 日 | [runbook §6](rotation-runbook.md#6-sentry-のトークン) |
| `SENTRY_READ_TOKEN` | 置かない（`scripts/csp-reports.py` の実行時に入力）。環境変数で渡すこともできる | CSP 違反レポートの読み取り | エラーイベント（伏せ字処理済み）の読み出し | 180 日 | [runbook §6](rotation-runbook.md#6-sentry-のトークン) |
| `WEDDING_PASSCODE` | Vercel（Sensitive・Production のみ。2026-10-12 確認）。開発機の `.env.local` にもある（§4 の見直し） | 招待状のパスコード（`/api/guest/passcode`） | 招待されていない人が登録の手前まで進める（承認は別に要る） | 定期には変えない（招待状に印刷するため）。漏れたときだけ | [runbook §7](rotation-runbook.md#7-パスコードと招待コード) |
| `INVITE_CODES_JSON` | Vercel（`ENABLE_INVITE_CODES` が有効なとき）。登録の有無はオーナー確認 | 招待コードと、付けるタグの対応 | コードを知った人が、そのタグで入れる | 定期には変えない。漏れたときだけ | [runbook §7](rotation-runbook.md#7-パスコードと招待コード) |
| `AUDIT_IP_SALT` | Vercel。登録の有無・種別はオーナー確認（無いと、監査ログに IP の仮名が残らない。`src/lib/audit.ts` の `hashIp`） | 監査ログの IP を HMAC で仮名化する鍵 | 監査ログの `ipHash` から IP を総当たりで割り出せる | **変えない**（変えると、前後の `ipHash` を突き合わせられなくなる）。漏れたときだけ | [runbook §8](rotation-runbook.md#8-監査ログの-ip-の-salt) |
| `LINE_CHANNEL_ACCESS_TOKEN`（Issue #168） | Vercel（**Sensitive・Production のみ**。Preview・開発機には置かない。登録はオーナー） | 公式 LINE（Messaging API のチャネル）から通知を送る（push）・今月の通数の残りを読む（`src/lib/line-notify-server.ts`）。無い環境では通知を送らない（エラーにしない） | 公式 LINE のアカウントとして、友だち全員に任意のメッセージを送れる（なりすまし・フィッシングの入口）。無料の通数を使い切られる | 180 日 + 当日前（長期のトークン） | [runbook §11](rotation-runbook.md#11-line-の-messaging-api-のチャネルアクセストークン) |
| `ELEVENLABS_API_KEY` | Vercel（Sensitive・Production のみ。2026-10-12 確認） | **コードのどこからも読まれていない**（音声合成は Modal）。使っていないので消す予定（2026-10-12 オーナー決定。Vercel から消し、ElevenLabs 側でもキーを失効させる） | ElevenLabs の課金 | 入れ替えない。消す | — |

**サービスアカウントについて（2026-10-12 に `gcloud` の読み取りで確認）:** Vercel に入っている鍵は、Firebase が自動で作ったサービスアカウント `firebase-adminsdk-fbsvc@<PROJECT_ID>.iam.gserviceaccount.com` のもの。Terraform（`infra/terraform/service_account.tf`）が作る最小権限の `wedding-app-server` は、ユーザー管理の鍵が 1 本も無く、本番では使われていない。`firebase-adminsdk-fbsvc` のロールは `roles/firebase.sdkAdminServiceAgent`・`roles/firebaseauth.admin`・`roles/iam.serviceAccountTokenCreator`・`roles/storage.admin`・`roles/aiplatform.user` で、`wedding-app-server`（`firebaseauth.admin`・`datastore.user`・`aiplatform.user`）より広い。どちらに寄せるかは、キーレス化の PoC で決める（[keyless-service-account.md](keyless-service-account.md)）。

**`FIREBASE_SERVICE_ACCOUNT_JSON` について:** `firebase-admin.ts` と運用スクリプトは、`_B64` が無いときにこの名前も読む。登録しているのは `_B64` だけ。

## 2. コードの外にある資格情報（アカウントと CLI）

コードは読まないが、破られると上の秘密をすべて取り出せる・入れ替えられる。保護は [account-checklist.md](account-checklist.md)。

| 資格情報 | 置き場所 | できること | 管理 |
|---|---|---|---|
| Google アカウント（GCP・Firebase のオーナー） | オーナー本人 | すべて（鍵の発行、Rules、データ） | MFA。Owner / Editor を日常で使わない |
| `gcloud` のログインと ADC | Codespaces のホーム（`scripts/ensure-gcloud-auth.sh` で更新） | Terraform の `plan` / `apply`、運用スクリプト | 長く使わないときは `gcloud auth revoke` と `gcloud auth application-default revoke` |
| Terraform の state（`infra/terraform/terraform.tfstate`） | ローカル（Git に入れない） | 構成の全体像。鍵は入れていない（`service_account.tf` の ★） | サービスアカウントの鍵を Terraform で作らない |
| GitHub アカウント・`gh` のトークン | オーナー本人、Codespaces | `main` への push = 本番デプロイ | MFA、ブランチ保護、Secret scanning と Push protection（2026-10-12 設定） |
| Vercel アカウント・CLI のトークン | オーナー本人、Codespaces（`.vercel/`）。長期の `VERCEL_TOKEN` が開発機の `.env.local` にある（§4 の見直し） | 環境変数の読み書き、デプロイ、Firewall | MFA。トークンの棚卸し |
| Cloudflare アカウント・`wrangler` のログイン・API トークン | オーナー本人、Codespaces。`CLOUDFLARE_API_TOKEN` が開発機の `.env.local` にある（§4 の見直し） | DNS、R2、Worker とその Secret | MFA。トークンは用途ごとに最小の権限 |
| LINE Developers（チャネル・LIFF） | オーナー本人 | LIFF の設定変更（エンドポイント URL の差し替え = ログインの乗っ取り） | MFA。Channel Secret は下の注 |
| Sentry・Modal・AWS のアカウント | オーナー本人 | トークン・鍵の発行、データの閲覧 | MFA |

**`GCP_SERVICE_ACCOUNT_B64` について:** 実機の変数名は `FIREBASE_SERVICE_ACCOUNT_B64` で、この名前は Vercel に登録していない。読むのは `src/app/api/admin/ai-test/route.ts` の 1 か所だけで、`GCP_SERVICE_ACCOUNT_B64 || FIREBASE_SERVICE_ACCOUNT_B64` の順に見る（`firebase-admin.ts` と運用スクリプトは `FIREBASE_SERVICE_ACCOUNT_B64` しか読まない）。Vertex AI を別のサービスアカウントに分けるときに登録する名前で、そのときは §1 の表に行を足す。

**LINE の Channel Secret について:** このアプリは使っていない。ログインは LINE の ID トークンを `https://api.line.me/oauth2/v2.1/verify` に `client_id`（チャネル ID）を付けて検証するだけで、Secret を送らない。Vercel に `LINE_CHANNEL_SECRET` のような変数があれば、どこからも読まれていないので消してよい（オーナー確認）。Secret 自体は LINE Developers のコンソールにあり、再発行の手順は [runbook §9](rotation-runbook.md#9-line-の-channel-secret)。

## 3. 秘密ではない設定（ローテーション不要）

値を知られても、それだけでは何もできない。ここに並べるのは、秘密と取り違えないため。

| 名前 | 中身 | 注意 |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` ほか `NEXT_PUBLIC_FIREBASE_*` | Firebase のクライアント設定 | ブラウザに配る前提の値。守りは Rules と Custom Claims。API キーには 2026-10-12 に HTTP リファラーの制限を付けた（`https://wedding.sw-lab.net/*`・`http://localhost:3000/*`・`https://*.app.github.dev/*`）。許可したリファラーは通り、ほかは遮断されることを `curl` で確認済み。「使える API」の制限は Firebase の既定（27 件）のまま。**配信元を足すとき（別のドメイン・別のポート）は、ここにも足さないとログインできない** |
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

- 本番の秘密は **Vercel の環境変数（Production のみ。種類は Sensitive）**、Worker の秘密は `wrangler secret put`、Modal の秘密は `modal secret` に置く。コード・コミット・Issue・ログ・Sentry には書かない（CLAUDE.md のルール 3・4）。
- Preview と Development の環境には、本番の秘密を入れない（Preview はどのブランチのコードでも動く）。2026-10-12 に、§1 で「Production のみ」と書いた 9 つをそうした。**そのため Preview のデプロイでは、ログイン・写真の投稿・顔検出・音声合成・webhook など、秘密を使う機能は動かない。** 画面の確認は `npm run dev:emulator` で行う。
- §3 の秘密ではない設定（`NEXT_PUBLIC_*`・`R2_BUCKET_*`・`GCP_*`・`VERTEX_MODEL` など）は、Sensitive にせず、従来の種別のまま。
- Sensitive の変数は、登録したあと値を読み出せない。**ほかに控えの無い値（`WEDDING_PASSCODE` など）は、パスワードマネージャーに控えを置く**（2026-10-12 は、Production から消えた `WEDDING_PASSCODE` を開発機の `.env.local` の値から戻した。`.env.local` を整理する前に、控えを移しておく）。
- Vercel の環境変数を足す・変える・消すときは、コマンドの出力を隠さず、結果を管理画面か API で確かめる（`.vercel/repo.json` の形式のとき、CLI の一覧が空になり、登録や削除が黙って失敗することがある。[rotation-runbook.md](rotation-runbook.md) の「共通の決まり」）。
- 混入の検査は CI の gitleaks（PR の差分と、毎週の履歴全体。`.github/workflows/security.yml`）。検出されたら、先に [rotation-runbook.md](rotation-runbook.md) の「漏れたとき」を行う。

### 開発機（Codespaces）の `app/web/.env.local`

置くのは、運用スクリプトに要るものだけ。**`名前=値` の形でない行を残さない**（2026-10-12 に、Sentry の個人用トークンだけが書かれた行が見つかり、行を消してトークンを失効させた）。

**サービスアカウントの鍵は置かない**（2026-10-12 に `FIREBASE_SERVICE_ACCOUNT_B64` の行を消した）。鍵が無いとき、`firebase-admin.ts` と運用スクリプトは ADC（`gcloud auth application-default login`）を使う。

- ADC で動くもの: Firestore と Auth の読み書き（`ops.mjs`・`make-admin.mjs` などの運用スクリプト）。
- **ADC では動かないもの: `createCustomToken`（`/api/auth/line` のカスタムトークンの発行）。** ユーザーの ADC には署名に使う秘密鍵が無い。ふつうの `npm run dev` で LINE ログインまで通したいときは、サービスアカウントの偽装（impersonation）などのキーレス化が要る（[keyless-service-account.md](keyless-service-account.md)）。画面の確認は `npm run dev:emulator`（鍵も ADC も要らない）で足りる。

いま残っている秘密と、見直しの案（**案。置くかどうかはオーナーが決める。未決定**）:

| 名前 | リポジトリでの使い道 | 案 |
|---|---|---|
| `VERCEL_TOKEN`（長期） | `scripts/infra-verify.sh` が、あれば `--token` に渡す。無くても `vercel login` の状態で動く | 消す。要るときだけ、期限つき・最小のスコープで作る。漏れると環境変数の読み書きとデプロイができる |
| `CLOUDFLARE_API_TOKEN` | リポジトリのコードは読まない（`wrangler` が環境変数として使う） | 消して `npx wrangler login` にする。残すなら、Worker のデプロイと R2 だけの権限に絞る |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | `app/web/scripts/scan-published-metadata.mjs`・`scripts/inspect-markers.mjs` | 本番と同じ鍵を置かない。要るなら、読み取りだけの別トークンを作って置く |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | 運用スクリプトは読まない（読むのは `src/lib/rekognition.ts`。`next dev` で顔検出を試すときだけ） | 消す |
| `MODAL_TTS_TOKEN` | 運用スクリプトは読まない（読むのは `/api/admin/tts`。`next dev` で音声を試すときだけ） | 消す |
| `WEDDING_PASSCODE` | 運用スクリプトは読まない（`next dev` で合言葉を試すときだけ） | パスワードマネージャーに控えを移してから消す |

## 5. 棚卸しの記録

四半期に一度と、披露宴の 1 か月前に、オーナーが管理画面と突き合わせる。

| 日付 | 確認した人 | 結果（増減・失効させたもの。値は書かない） |
|---|---|---|
| 2026-10-12 | オーナー | Vercel: 9 つ（`FIREBASE_SERVICE_ACCOUNT_B64`・`WEDDING_PASSCODE`・`R2_ACCESS_KEY_ID`・`R2_SECRET_ACCESS_KEY`・`AWS_ACCESS_KEY_ID`・`AWS_SECRET_ACCESS_KEY`・`ELEVENLABS_API_KEY`・`MODAL_TTS_TOKEN`・`WORKER_WEBHOOK_SECRET`）を Sensitive・Production のみにした。`SENTRY_AUTH_TOKEN` を新しいトークンに差し替え、古い個人用トークンを Sentry で失効。サービスアカウントの鍵を入れ替え（[rotation-runbook.md](rotation-runbook.md) の記録）。Firebase の Web API キーにリファラーの制限を追加。開発機の `.env.local` から、サービスアカウントの鍵の行と、Sentry のトークンの行を削除。**残り:** `AUDIT_IP_SALT`・`INVITE_CODES_JSON`・`REKOGNITION_*`・`LINE_CHANNEL_SECRET` の登録の有無の確認、`ELEVENLABS_API_KEY` の削除、開発機の `.env.local` の見直し（§4） |
