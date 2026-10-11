# 運用アカウントの保護のチェックリスト（Issue #102）

オーナーが実施し、終えた日付を書く。**回復コード・パスワード・トークンの値は、ここに書かない。**

アプリの守りが堅くても、運用に使うアカウントが 1 つ破られると、鍵の入れ替えも本番デプロイもできてしまう。確認は、四半期に一度と、披露宴（2027-05-29）の 1 か月前に繰り返す。

## 1. 多要素認証（MFA）

できれば、セキュリティキー（FIDO2）かパスキー。SMS は、ほかに方法が無いときだけ。

| サービス | MFA を有効にした日 | 方式（セキュリティキー・パスキー・認証アプリ） | 回復コード・予備キーを保管した日 |
|---|---|---|---|
| GitHub | | | |
| Google（GCP・Firebase） | | | |
| Vercel | | | |
| Cloudflare | | | |
| LINE Developers（LINE ビジネス ID） | | | |
| Sentry | | | |
| AWS（ルートユーザーと IAM ユーザー） | | | |
| Modal | | | |

- 回復コードと予備のキーは、パスワードマネージャーと、紙の控えの両方に置く。
- AWS と Modal は Issue の一覧には無いが、鍵（Rekognition）と課金（GPU）を持つので足してある。

## 2. メンバーと権限

| サービス | 見るもの | 確認した日 | 外した権限（無ければ「なし」） |
|---|---|---|---|
| GitHub | リポジトリの Collaborators、Deploy keys、インストール済みの GitHub Apps、個人の Personal access tokens | | |
| GCP | IAM の一覧。Owner / Editor を持つ主体を最小にし、日常の作業では使わない。使っていないサービスアカウントと鍵を消す | | |
| Firebase | プロジェクトのメンバー、Authentication のログイン方法（使っていないものを無効に） | | |
| Vercel | チームのメンバー、連携している Git のアカウント、Integrations | | |
| Cloudflare | アカウントのメンバー | | |
| LINE Developers | プロバイダーとチャネルの管理者。LIFF のエンドポイント URL が `https://wedding.sw-lab.net/...` であること | | |
| Sentry | 組織のメンバー | | |

## 3. GitHub の保護

| 項目 | 設定した日 |
|---|---|
| `main` のブランチ保護: force push と削除を禁止 | |
| `main` のブランチ保護: PR を必須にする（できれば `security`・`rules-test` を必須チェックに） | |
| Secret scanning を有効にする | |
| Push protection を有効にする | |
| Dependabot security updates を有効にする | |

- プランによっては、private リポジトリで使えない項目がある。使えないものは「不可」と書き、PR 上で CI の赤が無いことを見てからマージする運用で補う。

## 4. API トークンの棚卸し

サービスごとに一覧を見て、用途の分からないもの・使っていないものを失効させる。残すものは、用途ごとに最小の権限にする。**ここに書くのは名前と用途だけ。**

| サービス | トークンの名前 | 用途 | 権限の範囲 | 作成日 | 残す／失効 |
|---|---|---|---|---|---|
| Vercel | | | | | |
| Cloudflare | | | | | |
| GCP（サービスアカウントの鍵） | | | | | |
| Sentry | | | | | |
| AWS（アクセスキー） | | | | | |

アプリが使う秘密の一覧は [secrets-inventory.md](secrets-inventory.md)、入れ替えの手順は [rotation-runbook.md](rotation-runbook.md)。

## 5. 確認の記録

| 日付 | 確認した人 | メモ |
|---|---|---|
| | | |
