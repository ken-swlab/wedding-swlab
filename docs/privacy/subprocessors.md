# 外部のサービス（委託先）の一覧（Issue #105）

最終更新: 2026-10-12（コードが実際に呼んでいるものから作成）

ゲストのデータが渡る・置かれる外部のサービス。データの種類ごとの一覧は [data-inventory.md](data-inventory.md)、鍵とトークンは [../security/secrets-inventory.md](../security/secrets-inventory.md)。

- 「所在地」は、**データが置かれる・処理される場所**で、コードと Terraform から分かる範囲。「オーナー確認」は、各サービスの管理画面でしか分からないもの。
- 各社との契約（DPA の締結の有無、プラン）は、ここでは確かめていない。**法的な位置づけ（委託に当たるか、外国にある第三者への提供に当たるか）は、専門家に確かめる。**
- リンクは 2026-10-12 に開けることを確かめた。内容は各社が変える。

## 1. 一覧

| サービス（会社） | 用途 | 渡る・置かれる情報 | 所在地 | 公式の資料 |
|---|---|---|---|---|
| **LINE ログイン・LIFF**（LINE ヤフー） | ログイン。ID トークンの検証（`api.line.me`）。アイコン画像の配信（`profile.line-scdn.net`） | こちらから LINE へ: ID トークン（検証のため）。LINE から受け取る: **ユーザー ID（`sub`）・表示名（`name`）・アイコンの URL（`picture`）だけ**。友だち・トーク・メールアドレス・電話番号は取得しない（§2） | 日本（LINE のサービス） | [プライバシーポリシー](https://www.lycorp.co.jp/ja/company/privacypolicy/)・[ID トークンの検証](https://developers.line.biz/ja/docs/line-login/verify-id-token/) |
| **Firebase / Google Cloud**（Google） | Firestore（データベース）、Firebase Authentication（ログインのアカウント）、Firebase Storage（参照用の顔写真）、Cloud Logging・GCS（監査ログ・閲覧ログ・バックアップ） | ゲストのデータのほぼすべて（プロフィール、本名、出欠、アレルギー、投稿の本文、顔の記録、ログ） | Firestore・GCS は東京（asia-northeast1）。Firebase Authentication は Google の運用（米国を含む。オーナー確認） | [Firebase のプライバシーとセキュリティ](https://firebase.google.com/support/privacy)・[データ処理の追加条項](https://cloud.google.com/terms/data-processing-addendum) |
| **Vertex AI**（Google） | 管理者の AI の試験（`/admin/ai-test`）。**ゲストが使う機能は、まだ無い** | 相手に選んだゲストの呼び名・**本名**・タグ・運営のメモ、エピソードの本文、管理者が打った文 | 既定は東京（`GCP_LOCATION`。未設定なら asia-northeast1） | [生成 AI とデータの扱い](https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance) |
| **Cloudflare**（R2・Workers・DNS） | 写真・動画の保管と配信（R2）、原本の EXIF を落とす処理（Worker）、DNS | 写真・動画（軽量版・高画質版・**EXIF つきの原本**）、キーに入った uid、公開バケットを見に来た人の IP（配信のため） | R2 のバケットの場所はオーナー確認。配信は世界中の拠点 | [プライバシーポリシー](https://www.cloudflare.com/privacypolicy/)・[DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)・[Trust Hub](https://www.cloudflare.com/trust-hub/) |
| **AWS Rekognition**（Amazon Web Services） | 写真の顔の検出と、ゲストとの照合 | 検出のたびに、**写真（軽量版）のバイト列**。管理者が確定した顔は、**特徴データ（ベクトル）と uid** がコレクションに保存される（写真そのものは保存されない） | リージョンは環境変数（`REKOGNITION_REGION` / `AWS_REGION`）。**オーナー確認** | [Rekognition の FAQ](https://aws.amazon.com/rekognition/faqs/)・[データのプライバシー](https://aws.amazon.com/compliance/data-privacy-faq/)・[AI サービスのオプトアウト](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_ai-opt-out.html) |
| **Vercel** | アプリの配信と API の実行、Firewall | すべてのリクエストが通る（IP・User-Agent・URL。API の本文は処理のためにメモリを通るが、保存はしない）。関数のログ・Firewall のログ | 関数のリージョンはオーナー確認（既定は米国）。配信は世界中の拠点 | [プライバシーポリシー](https://vercel.com/legal/privacy-policy)・[DPA](https://vercel.com/legal/dpa)・[セキュリティ](https://vercel.com/security) |
| **Sentry**（Functional Software） | エラーと CSP 違反の報告 | エラーの内容・ルート名・リクエスト ID・ブラウザの種類。**本文・ヘッダ・Cookie・IP・uid・JWT は、送る前に落とす**（`sentry-scrub.ts`、`sendDefaultPii: false`）。Session Replay は入れていない | 米国（リージョンは DSN による。オーナー確認） | [プライバシーポリシー](https://sentry.io/privacy/)・[DPA](https://sentry.io/legal/dpa/)・[セキュリティ](https://sentry.io/security/) |
| **Modal**（Modal Labs） | 音声合成（管理者だけ。`/api/admin/tts`） | 読み上げる文（管理者が打った文・AI の返事。最大 400 文字）。ゲストの識別子は送らない | 米国（オーナー確認） | [プライバシーポリシー](https://modal.com/legal/privacy-policy)・[セキュリティ](https://modal.com/docs/guide/security) |

- アイコンや写真は、ブラウザが配信元（LINE・R2）から直接読む。そのとき、見に行く人の IP が配信元に届く。CSP は Google のアイコン配信（`lh3.googleusercontent.com`）も許可しているが、ログインは LINE だけで、いまは使っていない。

**ゲストのデータが渡らないもの**（一覧に入れていない）: GitHub（コードと CI だけ。リポジトリは公開）、ElevenLabs（コードから呼んでいない。キーは消す予定。[secrets-inventory.md](../security/secrets-inventory.md)）。

## 2. LINE から取得する情報

- 取得するのは、**LINE の ID トークンに入っている値だけ**: ユーザー ID（`sub`）、表示名（`name`）、アイコンの URL（`picture`）。あとは検証用の値（発行者・宛先・期限）。
- **取得しないもの**: 友だちの一覧、トークの内容、メールアドレス、電話番号、公式アカウントとの友だち状態。コードは `liff.init`・`liff.login`・`liff.getIDToken` しか呼ばない（プロフィール API・友だち状態の API は呼ばない）。
- 使い道と置き場所:

  | 値 | 使い道 | 置き場所 | 見られる人 |
  |---|---|---|---|
  | ユーザー ID | アカウントの識別（uid は `line:<ユーザー ID>`） | Firebase Authentication、`guestAdmin.lineUserId`、各データの uid | 管理者。uid は、投稿の作者などとして、ほかのゲストのブラウザにも届く（画面には出さない） |
  | 表示名 | 管理者が「誰のアカウントか」を見分けるため | Firebase Authentication、`guestPrivate.lineDisplayName` | 本人・管理者。**ほかのゲストには見せない**（本名のことが多いため。`guests` には書かない） |
  | アイコンの URL | 投稿者のアイコンとして表示 | Firebase Authentication、`guests.photoURL` | 承認済みゲスト全員（本人が別の画像に変えられる） |

- LINE 側でこのアプリに許可しているスコープは、LINE Developers のコンソールの設定（オーナー確認。コードが要るのは `openid` と `profile`）。
- このアプリから LINE へ、メッセージを送る機能は無い（通知はアプリ内だけ）。

## 3. 足す・やめるとき

- 外部のサービスを足す・やめる PR では、この一覧と [privacy-policy-draft.md](privacy-policy-draft.md) の「外部のサービス」も直す。ポリシーを公開したあとは、公開中のポリシーも直す。
- 秘密（環境変数）が増えるなら [../security/secrets-inventory.md](../security/secrets-inventory.md)、ブラウザが新しいホストに繋ぐなら `src/lib/csp.ts` も直す。
- 新しいサービスに渡す前に決めること: 何を渡すか（最小にする）、どこに置かれるか、消す手段があるか（[deletion-runbook.md](deletion-runbook.md) に手順を足せるか）。
