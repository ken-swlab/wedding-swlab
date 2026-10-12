# 秘密情報のローテーション手順書（Issue #102）

最終更新: 2026-10-12

対象の一覧と周期は [secrets-inventory.md](secrets-inventory.md)。**ここに書いた操作は、すべてオーナーが実行する**（Claude Code は実行しない）。

## 共通の決まり

- **秘密の値を、Issue・PR・コミット・チャット・ログに貼らない。** ターミナルに表示させない（`cat` しない、コマンドの引数に直接書かない）。
- 順番は必ず **「新しい値を登録する → 登録されたことを確かめる（管理画面か API）→ 再デプロイする → 動作を確かめる（ログインと写真の投稿まで）→ 古い値を無効にする → 数日後に消す」**。先に無効にすると本番が止まる。登録が失敗したまま先へ進んでも止まる。
- **「登録されたこと」は、名前があることだけでなく、対象の環境が Production であることまで見る。** 2026-10-12 の障害は、`FIREBASE_SERVICE_ACCOUNT_B64` が Preview にしか無かったことと、`WEDDING_PASSCODE` が Production から消えていたことが原因だった（下の「2026-10-12 の作業と障害」）。環境変数をまとめて触ったあとは、触っていない変数も含めて、Production の一覧を [secrets-inventory.md](secrets-inventory.md) と突き合わせる。
- **復旧のために古い値を戻した（鍵を再び有効にした）ときは、復旧が済んだら必ずもう一度無効にする。** 戻したこと・無効にし直したことを、下の「記録」に書く。戻したまま忘れると、入れ替えた意味がなくなる。
- **環境変数を書き換えるコマンドの出力を隠さない。** `> /dev/null`・`2>/dev/null`・`| tail`・`--silent` などを付けず、成功・失敗の表示を最後まで読む。値は標準入力のファイルから渡すので、出力に値は出ない（隠すのは値で、コマンドの結果ではない）。
- **Vercel CLI の表示だけを信じない。** このリポジトリの `.vercel/` は `repo.json` の形式（`vercel link --repo`）で、この形式のとき `vercel env ls` の一覧が空になり、`vercel env rm` / `vercel env add` がエラーを出さずに何もしないことがある。登録・削除のあとは、**必ず Vercel の管理画面（Settings → Environment Variables）か API（`GET /v10/projects/<プロジェクト ID>/env?teamId=<チーム ID>`。`vercel api` で呼べる）で、その名前が Production にあり、更新日時が今になっていること**を確かめる。確かめられなければ、管理画面から入れ直す。
- Vercel の環境変数は、**次のデプロイから**効く。変えたら Vercel の管理画面の Deployments → 最新の Production → **Redeploy** で出し直す（`vercel --prod` / `vercel deploy` は使わない。CLAUDE.md のルール 17）。`NEXT_PUBLIC_*` は、ビルドし直さないと変わらない。
- Vercel に入れるときは、Production だけに、種類を Sensitive にして入れる。CLI なら `vercel env add <名前> production --sensitive --force < <値のファイル>`（値は標準入力から渡す。`--value` で引数に書かない）。管理画面から入れてもよい。
- 披露宴（2027-05-29）の 1 か月前に全部を一度入れ替え、それ以降は、漏れたとき以外は当日まで変えない。
- 終わったら、下の「記録」に日付を書く（値は書かない）。
- 動作の確認に共通で使うもの:
  - `curl -sI https://wedding.sw-lab.net/api/health` の `X-Build` が、新しいデプロイのコミットになっている
  - スマホで LINE ログイン → タイムラインが出る → **写真を 1 枚投稿できる**（文字だけの投稿では確かめたことにならない。文字だけの投稿はブラウザから Firestore に直接書くので、サーバーの鍵が壊れていても通る。`src/lib/posts.ts`）
  - Sentry に新しいエラーが出ていない
  - Vercel のログに `MetadataLookupWarning`（google-auth）が出ていない。出ていたら、`FIREBASE_SERVICE_ACCOUNT_B64` が Production に無く、`firebase-admin.ts` が `applicationDefault()` に落ちている

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

対象: `FIREBASE_SERVICE_ACCOUNT_B64`（Vercel に登録しているのはこの名前だけ。Admin SDK も Vertex AI もこの鍵を使う）。サービスアカウントは `firebase-adminsdk-fbsvc@<PROJECT_ID>.iam.gserviceaccount.com`（Firebase が自動で作ったもの。2026-10-12 に `gcloud` で確認）。Terraform の `wedding-app-server`（`infra/terraform/service_account.tf`）には鍵が無く、本番では使っていない。

```bash
bash scripts/ensure-gcloud-auth.sh
SA="firebase-adminsdk-fbsvc@<PROJECT_ID>.iam.gserviceaccount.com"

# 1. いまある鍵を見る（ID と作成日・無効かどうかを控える。有効なユーザー管理の鍵は 1 本だけが正常。
#    どの鍵が Vercel に入っているか分からないときは、分かるまで古い鍵を無効にしない）
gcloud iam service-accounts keys list --iam-account="$SA" --managed-by=user

# 2. 新しい鍵を作る（リポジトリの外、メモリ上の一時ディレクトリに）
umask 077 && D="$(mktemp -d -p /dev/shm)"
gcloud iam service-accounts keys create "$D/key.json" --iam-account="$SA"

# 3. 新しい鍵を Vercel に登録する（値は標準入力から。コマンドの出力は隠さずに読む）
base64 -w0 "$D/key.json" > "$D/key.b64"
cd app/web
vercel env add FIREBASE_SERVICE_ACCOUNT_B64 production --sensitive --force < "$D/key.b64"
```

4. **登録されたことを確かめる。** 管理画面か API で、`FIREBASE_SERVICE_ACCOUNT_B64` が **Production** にあり（Preview だけになっていないこと）、種別が Sensitive で、更新日時が今になっていることを見る（共通の決まり。CLI が成功と表示しても、一覧が空でも、ここで確かめる）。更新されていなければ、管理画面から `$D/key.b64` の中身を入れ直す。
5. 手元の写しを消す: `rm -rf "$D"`（4 を確かめてから。先に消すと、登録に失敗していたときに鍵を作り直すことになる）。
6. Vercel の管理画面で Redeploy し、終わるのを待つ。
7. **ログインと写真の投稿まで確かめる。** スマホで LINE ログイン → タイムラインが出る → 写真を 1 枚投稿する、までを必ず行う（`createCustomToken` がこの鍵で署名するので、鍵が壊れているとログインが失敗する。`/api/uploads/presign` と `/api/faces/detect` も Admin SDK を使うので、写真の投稿が失敗する）。管理画面で `/api/admin/ai-test`（Vertex AI）も 1 回試す。
8. 古い鍵を無効にする: `gcloud iam service-accounts keys disable <古い鍵の ID> --iam-account="$SA"`。おかしくなったら `keys enable` で戻せる。**戻したときは、原因を直して 4〜7 をやり直したあと、必ずもう一度 `keys disable` する**（`keys list` の `DISABLED` で確かめる）。途中で作って使わなかった鍵も、ここで無効にする。
9. 無効にしたあと、もう一度ログインと写真の投稿を確かめる。数日たって問題が無ければ、古い鍵を消す: `gcloud iam service-accounts keys delete <古い鍵の ID> --iam-account="$SA"`。`keys list` で、鍵が 1 本だけになったことを確かめる。

- `--force` は同じ名前の変数を上書きする。Redeploy が終わるまでは、動いているデプロイが古い値を持ったままなので止まらない。
- **4 と 7 を飛ばして古い鍵を無効にしない。** 登録が黙って失敗していると、本番は古い鍵のまま動いていて、無効にした瞬間に全員がログインできなくなる。
- 鍵を無効にしても・消しても、ログイン済みのゲストはそのまま使える（発行済みの ID トークンは Google の鍵で署名されている）。
- `GCP_SERVICE_ACCOUNT_B64` は Vercel に登録していない。`/api/admin/ai-test` のコードはこの名前があれば先に読むが、無いので `FIREBASE_SERVICE_ACCOUNT_B64` を使う。Vertex AI を別のサービスアカウントに分けるまで、この名前で登録しない。
- 開発機の `.env.local` には鍵を置かない（2026-10-12 に消した）。運用スクリプトは ADC で動く。ただし ADC では `createCustomToken` の署名ができないので、ふつうの `npm run dev` で LINE ログインは通らない（[secrets-inventory.md](secrets-inventory.md) §4、[keyless-service-account.md](keyless-service-account.md)）。
- 古い鍵を無効にする前に、その鍵がほかの場所（Vercel の Preview、開発機）でも使われていないかを見る。2026-10-12 は、同じ鍵が Production・Preview・開発機の 3 か所にあった。

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
# → 管理画面か API で、登録されたこと（Production・更新日時が今）を確かめる（共通の決まり）
# → Vercel の管理画面から Redeploy し、終わるのを待つ

cd ../../infra/workers/exif-stripper
npx wrangler secret put WEBHOOK_SECRET < "$D/secret"
rm -rf "$D"
```

- Redeploy が終わってから `wrangler secret put` までの間、Worker の通知は 401 になる。Worker は 401 を全体障害として扱い、回数を数えずに次の実行（2 分ごと）でやり直すので、**写真は失われない**。その間に投稿された写真の高画質版の公開が遅れるだけ。間を空けない。
- Vercel への登録を確かめずに `wrangler secret put` へ進まない。登録が黙って失敗していると、Worker だけが新しい値になり、通知が 401 のまま止まる。
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

- `SENTRY_AUTH_TOKEN`（ビルド時のソースマップのアップロード）: Sentry → Settings → Auth Tokens（組織のトークン。権限はソースマップのアップロードだけ）で新しく作る → Vercel に入れる（Sensitive・Production）→ 登録を確かめる → Redeploy → ビルドログでアップロードが成功していることを見る → 古いトークンを失効。個人用のトークン（`sntryu_` で始まるもの）は、本人の権限をそのまま持つので使わない。
- `SENTRY_READ_TOKEN`（`scripts/csp-reports.py`）: 保存していない。Sentry で古いトークンを失効させ、要るときに新しく作る（権限は読み取りだけ）。
- DSN（`NEXT_PUBLIC_SENTRY_DSN`）は秘密ではない。偽のイベントが多くて困るときだけ、Sentry の Client Keys で作り直す → Vercel に入れる → Redeploy → `python3 scripts/csp-verify.py` で CSP の報告先が新しい DSN になったことを確かめる → 古い Client Key を無効にする。

## 7. パスコードと招待コード

対象: `WEDDING_PASSCODE`、`INVITE_CODES_JSON`。

- **定期には変えない。** 招待状に印刷して配る値なので、変えるとまだ登録していないゲストが入れなくなる。
- Sensitive の変数は値を読み出せない。いまの値の控えを、パスワードマネージャーに置いておく（Production から消えたときに、戻す元になる）。
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
| 2026-10-12 | サービスアカウント鍵（`firebase-adminsdk-fbsvc`）。新: `ae0bab47`。旧: `43bfd482`（2026-09-18 作成）・`71d1aa3d`（2026-09-20 作成。未使用）・`c3cbc383`（作業中に作成。未登録） | 初回の棚卸し（Issue #102。鍵が複数あり、Preview と開発機にも置かれていた） | オーナー | 新しい鍵を Vercel の Production に Sensitive で登録 → 再デプロイ → LINE ログイン・写真の投稿・合言葉を確認。旧 3 本を無効化（`43bfd482` は復旧のために一度戻し、同日に無効にし直した。`keys list` で 3 本とも `DISABLED`、有効なのは `ae0bab47` だけ）。**旧 3 本の削除は未実施（数日後）** |
| 2026-10-12 | `SENTRY_AUTH_TOKEN` | 漏えいの疑い（個人用トークンが、開発機の `.env.local` に `名前=値` でない行として残っていた） | オーナー | Vercel の値を新しいトークンに差し替え（Sensitive・Production）。古いトークンを Sentry で失効。`.env.local` の行を削除 |
| 2026-10-12 | `WEDDING_PASSCODE` | 値は変えていない（Production から消えていたので、同じ値を登録し直した） | オーナー | 再デプロイ後に合言葉の動作を確認 |

## 2026-10-12 の作業と障害

Issue #102 の棚卸しとして、オーナーが実機で行った。値は書かない。鍵の ID は先頭 8 文字。

**行ったこと**

1. サービスアカウント鍵の入れ替え（上の記録の 1 行目）。入れ替えの前、`43bfd482` は Vercel の Production・Preview と開発機の `.env.local` の 3 か所で使われ、`71d1aa3d` はどこにも使われていなかった。
2. Vercel の 9 つの秘密を、Sensitive・Production のみに変更（[secrets-inventory.md](secrets-inventory.md) §5）。
3. `SENTRY_AUTH_TOKEN` の差し替えと、古い個人用トークンの失効。
4. Firebase の Web API キーに HTTP リファラーの制限を追加（[secrets-inventory.md](secrets-inventory.md) §3）。
5. 開発機の `.env.local` から、サービスアカウントの鍵の行と、Sentry のトークンの行を削除。

**障害**

- 症状: 写真の投稿が失敗した（`/api/uploads/presign`・`/api/faces/detect`）。Vercel のログに google-auth の `MetadataLookupWarning` が出ていた。文字だけの投稿には影響が出なかった（ブラウザから Firestore に直接書くため。`src/lib/posts.ts` の `addDoc`）。
- 原因: (a) `FIREBASE_SERVICE_ACCOUNT_B64` が Preview にしか登録されておらず、Production に無かった。鍵が無いと `firebase-admin.ts` は `applicationDefault()` に落ち、Vercel にはメタデータサーバーが無いので、Admin SDK を使う API が失敗する。(b) `WEDDING_PASSCODE` が Production から消えていた。
- 復旧: 新しい鍵と合言葉を Production に登録し直して再デプロイ。写真の投稿・LINE ログイン・合言葉の動作を確認した。途中、復旧のために `43bfd482` を一時的に有効に戻し、同日に無効にし直した。

**分かったこと（上の手順に反映済み）**

- 順番は「登録 → 登録の存在確認（Production にあること）→ 再デプロイ → ログインと写真の投稿まで確認 → 古い鍵を無効化 → 数日後に削除」。
- 環境変数を書き換えるコマンドの出力を隠さない。
- この環境の Vercel CLI（61.1.0）は `.vercel/repo.json` の形式でリンクされ、`vercel env ls` が空になり、`env rm` / `env add` が黙って失敗した。以後は Vercel の REST API（`projects/<プロジェクト ID>/env`）か管理画面で確かめた。
- 復旧のために古い鍵を有効に戻したら、必ず無効にし直す。
- Sensitive の変数は読み出せないので、合言葉のように控えが要る値は、パスワードマネージャーに置く。
