# 秘密情報のローテーション手順書（Issue #102）

最終更新: 2026-10-11

対象の一覧と周期は [secrets-inventory.md](secrets-inventory.md)。**ここに書いた操作は、すべてオーナーが実行する**（Claude Code は実行しない）。

## 共通の決まり

- **秘密の値を、Issue・PR・コミット・チャット・ログに貼らない。** ターミナルに表示させない（`cat` しない、コマンドの引数に直接書かない）。
- 順番は必ず **「新しい値を作る → 置き換える → 動作を確かめる → 古い値を失効させる」**。先に失効させると本番が止まる。
- Vercel の環境変数は、**次のデプロイから**効く。変えたら Vercel の管理画面の Deployments → 最新の Production → **Redeploy** で出し直す（`vercel --prod` / `vercel deploy` は使わない。CLAUDE.md のルール 17）。`NEXT_PUBLIC_*` は、ビルドし直さないと変わらない。
- Vercel に入れるときは、Production だけに、種類を Sensitive にして入れる。CLI なら `vercel env add <名前> production --sensitive --force < <値のファイル>`（値は標準入力から渡す。`--value` で引数に書かない）。管理画面から入れてもよい。
- 披露宴（2027-05-29）の 1 か月前に全部を一度入れ替え、それ以降は、漏れたとき以外は当日まで変えない。
- 終わったら、下の「記録」に日付を書く（値は書かない）。
- 動作の確認に共通で使うもの:
  - `curl -sI https://wedding.sw-lab.net/api/health` の `X-Build` が、新しいデプロイのコミットになっている
  - スマホで LINE ログイン → タイムラインが出る → 写真を 1 枚投稿できる
  - Sentry に新しいエラーが出ていない

## 漏れたとき（漏れたかもしれないとき）

gitleaks が検出した、画面共有に映った、端末をなくした、身に覚えのないアクセスがあった、など。

1. **その秘密を、下の該当する手順ですぐに入れ替え、古い値を失効させる。** コミットを消したり履歴を書き換えたりしても、漏れた値は取り消せない。失効が先。
2. 被害が広がりそうなら、先に止める: `cd app/web && node scripts/ops.mjs maintenance on`（約 10 秒で全ゲストに反映。戻すのは `off`）。
3. 使われた形跡を調べる:
   - GCP: Cloud Logging の監査ログ（サービスアカウントの鍵の ID で絞る）、`python3 scripts/pii-access-report.py`
   - アプリ: `cd app/web && node scripts/ops.mjs audit`
   - Cloudflare・Vercel・AWS・Sentry: それぞれの監査ログ（Audit Log）
4. サービスアカウントの鍵が漏れたときは、Custom Claims（`admin`）と `guestAdmin` / `guestPrivate` が書き換えられていないかも見る。
5. 個人情報（本名・アレルギー・顔写真・位置情報）が読まれた可能性があるなら、ゲストへの連絡と、個人情報保護委員会への報告が要るかを判断する。
6. いつ・何が・どう対応したかを、値を書かずに Issue に残す。

---

## 1. サービスアカウント鍵

対象: `FIREBASE_SERVICE_ACCOUNT_B64`（と、同じ鍵を入れているなら `GCP_SERVICE_ACCOUNT_B64`）。サービスアカウントは `wedding-app-server@<PROJECT_ID>.iam.gserviceaccount.com`（`infra/terraform/service_account.tf`）。

```bash
bash scripts/ensure-gcloud-auth.sh
SA="wedding-app-server@<PROJECT_ID>.iam.gserviceaccount.com"

# 1. いまある鍵を見る（ID と作成日を控える。ユーザー管理の鍵は 1 本だけが正常）
gcloud iam service-accounts keys list --iam-account="$SA" --managed-by=user

# 2. 新しい鍵を作る（リポジトリの外、メモリ上の一時ディレクトリに）
umask 077 && D="$(mktemp -d -p /dev/shm)"
gcloud iam service-accounts keys create "$D/key.json" --iam-account="$SA"

# 3. Vercel に入れる（値を画面に出さない）
base64 -w0 "$D/key.json" > "$D/key.b64"
cd app/web
vercel env add FIREBASE_SERVICE_ACCOUNT_B64 production --sensitive --force < "$D/key.b64"

# 4. 手元の写しを消す
rm -rf "$D"
```

5. Vercel の管理画面で Redeploy → 共通の確認（**LINE ログインができること**。`createCustomToken` がこの鍵で署名する）。管理画面で `/api/admin/ai-test`（Vertex AI）も 1 回試す。
6. 古い鍵を消す: `gcloud iam service-accounts keys delete <古い鍵の ID> --iam-account="$SA"`
7. もう一度 `keys list` で、鍵が 1 本だけになったことを確かめる。

- `--force` は同じ名前の変数を上書きする。Redeploy が終わるまでは、動いているデプロイが古い値を持ったままなので止まらない。
- 鍵を消しても、ログイン済みのゲストはそのまま使える（発行済みの ID トークンは Google の鍵で署名されている）。
- `GCP_SERVICE_ACCOUNT_B64` に別のサービスアカウントの鍵を入れているなら、そのサービスアカウントで同じ手順を行う。
- 開発機の `.env.local` に同じ鍵があれば、消して ADC に切り替える（[keyless-service-account.md](keyless-service-account.md) の代替策）。

## 2. R2 の API トークン

対象: `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`。

1. Cloudflare の管理画面 → R2 → Manage R2 API Tokens → Create API Token。権限は **Object Read & Write**、対象は `wedding-media` と `wedding-originals` の 2 つだけ。期限は付けない（切れると本番が止まるので、周期で入れ替える）。
2. 表示された Access Key ID と Secret Access Key を、Vercel の `R2_ACCESS_KEY_ID` と `R2_SECRET_ACCESS_KEY`（Production・Sensitive）に入れる。
3. Redeploy → 写真を 1 枚投稿し、高画質版が公開されるまで（2〜4 分）見る。
4. **`R2_PRESIGN_TTL` の秒数以上待ってから**、古いトークンを Cloudflare で失効させる（古い鍵で署名したアップロード用の URL が、まだ使われているかもしれない）。
5. 開発機の `.env.local` に R2 の鍵があれば、同じく入れ替える（`scan-published-metadata.mjs`・`inspect-markers.mjs` が使う）。

## 3. Worker の webhook の秘密

対象: Vercel の `WORKER_WEBHOOK_SECRET` と、Worker の `WEBHOOK_SECRET`。**同じ値の対。片方だけ変えない**（CLAUDE.md のルール 12）。

```bash
umask 077 && D="$(mktemp -d -p /dev/shm)"
openssl rand -base64 48 | tr -d '\n' > "$D/secret"

cd app/web
vercel env add WORKER_WEBHOOK_SECRET production --sensitive --force < "$D/secret"
# → ここで Vercel の管理画面から Redeploy し、終わるのを待つ

cd ../../infra/workers/exif-stripper
npx wrangler secret put WEBHOOK_SECRET < "$D/secret"
rm -rf "$D"
```

- Redeploy が終わってから `wrangler secret put` までの間、Worker の通知は 401 になる。Worker は 401 を全体障害として扱い、回数を数えずに次の実行（2 分ごと）でやり直すので、**写真は失われない**。その間に投稿された写真の高画質版の公開が遅れるだけ。間を空けない。
- 確認: `bash scripts/infra-verify.sh`、`npx wrangler tail` に 401 が出ていない、写真を 1 枚投稿して高画質版が公開される。

## 4. AWS Rekognition のアクセスキー

対象: `REKOGNITION_ACCESS_KEY_ID` / `REKOGNITION_SECRET_ACCESS_KEY`（無ければ `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`）。

1. AWS の IAM → 該当するユーザー → セキュリティ認証情報 → アクセスキーを作成（キーは 1 ユーザーに 2 本まで持てる）。
2. Vercel の 2 つの変数（Production・Sensitive）を入れ替える → Redeploy。
3. 管理画面で、顔の検出が動くことを確かめる（写真を 1 枚投稿し、顔の枠が付く）。
4. IAM で古いキーを「無効化」→ 1 日様子を見て「削除」。
5. ついでに、このユーザーのポリシーが Rekognition の必要な操作だけになっているかを見る。

## 5. 音声合成（Modal）のトークン

対象: Vercel の `MODAL_TTS_TOKEN` と、Modal の Secret `sbv2-auth` の `SBV2_TTS_TOKEN`。**同じ値の対。**

1. 新しい値を作る（§3 と同じく `openssl rand` をファイルに出す）。
2. Modal の管理画面で Secret `sbv2-auth` の `SBV2_TTS_TOKEN` を書き換え、アプリをデプロイし直す（`infra/modal/modal_app.py`。コンテナが新しい値を読むのは起動時）。
3. Vercel の `MODAL_TTS_TOKEN`（Production・Sensitive）を入れ替える → Redeploy。
4. 管理画面の音声のテストで、音が出ることを確かめる。2 と 3 の間は音声合成が 401 になる（管理者だけが使う機能）。

## 6. Sentry のトークン

- `SENTRY_AUTH_TOKEN`（ビルド時のソースマップのアップロード）: Sentry → Settings → Auth Tokens（組織のトークン。権限はソースマップのアップロードだけ）で新しく作る → Vercel に入れる → Redeploy → ビルドログでアップロードが成功していることを見る → 古いトークンを失効。
- `SENTRY_READ_TOKEN`（`scripts/csp-reports.py`）: 保存していない。Sentry で古いトークンを失効させ、要るときに新しく作る（権限は読み取りだけ）。
- DSN（`NEXT_PUBLIC_SENTRY_DSN`）は秘密ではない。偽のイベントが多くて困るときだけ、Sentry の Client Keys で作り直す → Vercel に入れる → Redeploy → `python3 scripts/csp-verify.py` で CSP の報告先が新しい DSN になったことを確かめる → 古い Client Key を無効にする。

## 7. パスコードと招待コード

対象: `WEDDING_PASSCODE`、`INVITE_CODES_JSON`。

- **定期には変えない。** 招待状に印刷して配る値なので、変えるとまだ登録していないゲストが入れなくなる。
- 漏れたとき: 新しい値を Vercel に入れる（`WEDDING_PASSCODE` の桁数は `src/config/passcode.ts` の `PASSCODE_LENGTH` と同じにする）→ Redeploy → まだ登録していないゲストに、新しい値を個別に伝える。登録済みのゲストには影響しない。
- 漏れた値で登録した人がいないかを、管理画面の未承認の一覧で見る（承認しなければ、名簿も投稿も見えない）。

## 8. 監査ログの IP の salt

対象: `AUDIT_IP_SALT`。

- **定期には変えない。** 変えると、同じ IP でも `ipHash` が変わり、前後の監査ログを突き合わせられなくなる。
- 漏れたとき: 新しい値（`openssl rand -base64 48`）を Vercel に入れる → Redeploy。変えた日時を Issue に残す（その前後で `ipHash` がつながらないことの記録）。

## 9. LINE の Channel Secret

このアプリは Channel Secret を使っていない（[secrets-inventory.md](secrets-inventory.md) の注）。漏れたときは、LINE Developers のコンソール → チャネル → チャネル基本設定 → チャネルシークレットの「再発行」。Vercel の変更も再デプロイも要らない。再発行のあと、スマホで LINE ログインができることだけ確かめる。

あわせて、LIFF の「エンドポイント URL」が `https://wedding.sw-lab.net/...` のままであることを見る（ここを書き換えられると、ログインを別のサイトに向けられる）。

## 10. アカウントと CLI のトークン

- Vercel・Cloudflare の API トークン: 管理画面で一覧を見て、使っていないものを失効させる。使うものは、用途ごとに最小の権限で作り直す。
- 開発機（Codespaces）を捨てるとき・長く使わないとき: `gcloud auth revoke`、`gcloud auth application-default revoke`、`vercel logout`、`npx wrangler logout`、`gh auth logout`。`app/web/.env.local` を消す。

---

## 記録

値は書かない。古い値を失効させた日を書く。

| 日付 | 対象 | 理由（定期・当日前・漏えい） | 実行した人 | 確認したこと |
|---|---|---|---|---|
| | | | | |
