# サービスアカウント鍵のキーレス化: 調査と方針（Issue #102）

調査日: 2026-10-11。対象は、Vercel の環境変数 `FIREBASE_SERVICE_ACCOUNT_B64` に入れているサービスアカウント `wedding-app-server` の鍵（Admin SDK・`createCustomToken`・Vertex AI が使う）。

この Issue では調査と方針まで。**実装はしていない。**

## 結論

- **実現できる見込み。ただし、試作（PoC）で確かめることが 1 つ残っている**（下の「確かめられていないこと」）。
- 方法は、Vercel の OIDC 連携と、GCP の Workload Identity Federation。Vercel が関数ごとに渡す短命のトークンを、GCP がサービスアカウントの短命のアクセストークン（1 時間）に交換する。鍵のファイルがどこにも無くなる。
- 追加の料金はかからない。Vercel の OIDC 連携は Hobby を含む全プランで使える。

## 方針（提案。オーナーが決める）

| | 提案 |
|---|---|
| やる／やらない | **やる。** ただし PoC が通ることが条件 |
| いつ | PoC を 2026 年内（別 Issue）。通れば、移行を **2027-02 末まで**に終える |
| 期限 | 2027-03 以降は、披露宴（2027-05-29）までログインまわりを変えない。2 月末までに終わらなければ、当日は下の「代替策」で迎え、キーレス化は披露宴のあとにする |
| それまでの間 | 下の「代替策」を今すぐ行う（鍵のローテーション、鍵を置く場所を Vercel だけにする、権限を絞る） |

決定の記録（オーナーが記入）:

| 日付 | 決定（やる／やらない／いつ） | 決めた人 |
|---|---|---|
| | | |

## いまの作り

- `src/lib/firebase-admin.ts` が、環境変数の鍵を `cert()` に渡して Admin SDK を初期化する。鍵が無ければ ADC（開発機の `gcloud auth application-default login`）を使う。
- `/api/auth/line` が `createCustomToken(uid)` でカスタムトークンを作る。**鍵の秘密鍵でその場で署名する**（外部への通信なし）。
- `/api/admin/ai-test`（Vertex AI）も、同じ鍵（または `GCP_SERVICE_ACCOUNT_B64`）を使う。
- サービスアカウントの権限は `roles/firebaseauth.admin`・`roles/datastore.user`・`roles/aiplatform.user`（`infra/terraform/service_account.tf`）。同じファイルに「将来は Workload Identity Federation で鍵レス化するのが理想」とある。

## 調べて分かったこと

| 項目 | 結果 | 根拠 |
|---|---|---|
| Vercel が OIDC トークンを出せるか | 出せる。全プラン。関数では `x-vercel-oidc-token` ヘッダで渡され、`@vercel/oidc` の `getVercelOidcToken()` で読む。トークンは最長 2 時間 | [Vercel: OIDC Federation](https://vercel.com/docs/oidc) |
| GCP が Vercel のトークンを信頼できるか | できる。Workload Identity のプールに OIDC のプロバイダを作る。発行者は `https://oidc.vercel.com/<チームのスラッグ>`、`google.subject` は `assertion.sub`。`sub` は `owner:<チーム>:project:<プロジェクト>:environment:<環境>` | [Vercel: Connect to GCP](https://vercel.com/docs/oidc/gcp) |
| 環境ごとに絞れるか | 絞れる。サービスアカウントを使えるのを `…:environment:production` の主体だけにすれば、Preview（どのブランチのコードでも動く）からは使えない | 同上 |
| 鍵なしで `createCustomToken` が動くか | 動く。鍵が無いとき、Admin SDK は IAM の `signBlob` を呼んで署名する（`serviceAccountId` で署名するサービスアカウントを指定）。`iam.serviceAccounts.signBlob` の権限が要る | [Firebase: Create custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens)、`node_modules/firebase-admin/lib/utils/crypto-signer.js`（`ServiceAccountCredential` 以外は `IAMSigner`） |
| 必要なライブラリ | `google-auth-library`（`ExternalAccountClient`）と `@vercel/oidc`。どちらも、いまは他のパッケージ経由で入っている（10.9.1 / 3.8.8）。直接の依存に足す | `app/web/node_modules` |
| Vertex AI | `@google/genai` は `googleAuthOptions` を受け取るので、同じ `authClient` を渡せる | Vercel のサンプル（上の GCP のページ） |

## 確かめられていないこと（PoC で見る）

1. **Firestore（Admin SDK）が、鍵でも ADC でもない資格情報を受け取らない。**
   `firebase-admin` 13.10 の `getFirestore()` は、資格情報が `cert()` か `applicationDefault()` のどちらでもないと `Must initialize the SDK with a certificate credential or application default credentials` で失敗する（`node_modules/firebase-admin/lib/firestore/firestore-internal.js` の `getFirestoreOptions`）。
   Vercel の OIDC トークンはリクエストのヘッダで渡されるので、ファイルを読む ADC の設定（`GOOGLE_APPLICATION_CREDENTIALS`）にはそのまま載せられない。
   → 案: Firestore だけ `@google-cloud/firestore` を直接、`authClient` を渡して作る。`admin()` が返す `db` の作り方が変わるだけで、API ルート側は変えない。**これが Vercel の関数で動くかが、PoC でいちばん見たい点。**
2. Auth（`verifyIdToken(token, true)`・`setCustomUserClaims`・`revokeRefreshTokens`）が、自作の資格情報（`getAccessToken()` を持つオブジェクト）で動くか。Admin SDK の作りからは動く見込み。
3. 依存を足したあと、`deps-runtime` のチェック（古い Node での `require()`）が通るか。Issue #38 と同じ種類の事故を避ける。
4. ログインの遅さ。署名が IAM への通信になるので、ログイン 1 回ごとに 1 往復増える（数百ミリ秒の見込み。実測する）。アクセストークンの交換は、関数のインスタンスごとに約 1 時間に 1 回。
5. 披露宴の当日のような、同時に 100 人がログインする場面で、IAM Credentials API の割り当てに余裕があるか（既定の割り当てを GCP のコンソールで確かめる）。

## 移行するときの作業（PoC が通ったあと。別 Issue）

**オーナー（`terraform apply` と Vercel の設定）**
1. Vercel: プロジェクトの Settings → Security → OIDC の発行者を **Team** にする。
2. Terraform に足して apply する:
   - `iamcredentials.googleapis.com` と `sts.googleapis.com` の有効化
   - Workload Identity のプールと、OIDC のプロバイダ（発行者・`google.subject = assertion.sub`・このプロジェクトの `sub` だけを通す条件）
   - `wedding-app-server` に、`…/subject/owner:<チーム>:project:<プロジェクト>:environment:production` からの `roles/iam.workloadIdentityUser`
   - `wedding-app-server` 自身に、自分に対する `roles/iam.serviceAccountTokenCreator`（`signBlob` のため）
3. Vercel の環境変数（どれも秘密ではない）: プロジェクト番号・サービスアカウントのメール・プールとプロバイダの ID。

**Claude Code（PR）**
4. `src/lib/firebase-admin.ts` を、OIDC の変数があればキーレス、無ければ今までどおり鍵、の順で初期化するように変える（切り戻しを環境変数の出し入れだけでできるようにする）。Vertex AI の認証も同じ `authClient` に寄せる。
5. Preview で確かめる → Production に出す → ログイン・投稿・管理画面・webhook・AI を確かめる。

**オーナー（片づけ）**
6. 1〜2 週間、鍵を残したまま様子を見る → Vercel から `FIREBASE_SERVICE_ACCOUNT_B64` を消す → GCP で鍵を削除する。
7. 開発機の運用スクリプト（`make-admin.mjs` など）は、今までどおり ADC で動く。

**費用と手間:** 料金は増えない。作業は、PoC に半日〜1 日、移行と確認に 1 日ほどの見込み。増えるのは、ログイン時の IAM への通信（遅さと、IAM・STS・Vercel の OIDC が止まったときにログインできなくなるという依存）。

**変わらないこと:** Vercel のプロジェクトに本番デプロイできる人は、キーレス化のあともサービスアカウントとして動ける。Vercel と GitHub のアカウントの保護（[account-checklist.md](account-checklist.md)）は、引き続きいちばん大事。

## 代替策（キーレス化までの間、または、やらない場合）

キーレス化の可否にかかわらず、今すぐやってよいもの。

| 策 | やること | 誰が |
|---|---|---|
| 鍵に期限を持たせる | 90 日ごとと、披露宴の 1 か月前に入れ替える（[rotation-runbook.md §1](rotation-runbook.md#1-サービスアカウント鍵)）。ユーザー管理の鍵は常に 1 本だけにする。Google Cloud の組織があれば、組織ポリシー `iam.serviceAccountKeyExpiryHours` で期限を強制できる（組織の無いプロジェクトでは使えない） | オーナー |
| 鍵を持つ環境を Vercel だけにする | Vercel では Production だけ・Sensitive にする（Preview と Development には入れない）。開発機の `app/web/.env.local` から鍵を消し、ADC を使う（コードは、鍵が無ければ ADC を使う）。鍵のファイルを手元やクラウドのストレージに残さない | オーナー |
| 権限を絞る | `roles/firebaseauth.admin` を、使っている操作だけのカスタムロールにする。Vertex AI は別のサービスアカウントに分け、`roles/aiplatform.user` を `wedding-app-server` から外す（コードは `GCP_SERVICE_ACCOUNT_B64` を先に見るので、変数を足すだけで分けられる） | Claude が Terraform の PR、オーナーが apply |
| 鍵が使われたら気づけるようにする | Cloud Logging で、サービスアカウントの鍵の作成（`CreateServiceAccountKey`）にアラートを付ける。Data Access ログ（`data_access.tf`）と `scripts/pii-access-report.py` を定期的に見る | Claude が Terraform の PR、オーナーが apply |
| 鍵を新しく作れないようにする（キーレス化のあと） | 組織があれば、組織ポリシー `iam.disableServiceAccountKeyCreation` | オーナー |
