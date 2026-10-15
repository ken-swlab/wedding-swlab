# セキュリティチェックシートの回答集（Issue #106）

最終更新: 2026-10-13（コード・Rules・Terraform・`docs/security`・`docs/privacy`・`docs/ops` から作成）

法人から届くセキュリティチェックシートに、**いまの実装の事実だけ**で答えるための下書き。概要は [security-overview.md](security-overview.md)、診断と認証の方針は [certification-roadmap.md](certification-roadmap.md)。

## 使い方と決まり

- 区分は 4 つ。**実施済み**（実装・設定が済み、根拠を示せる）／**一部実施**（穴がある。何が足りないかを書く）／**未実施**（予定があれば時期を書く。無ければ「未定」）／**対象外**（この構成には当てはまらない）。
- **認証・診断について:** このサービスと運営者は、ISMS（ISO/IEC 27001）・プライバシーマーク・SOC 2 などの**認証を取得していない。第三者による脆弱性診断・ペネトレーションテストも受けていない。**利用している各社（Google・Cloudflare・AWS・Vercel など）が持つ認証は、その会社のもので、このサービスの認証ではない。「準拠」「相当」「取得予定」と書かない（予定は、決まってから時期と一緒に書く）。
- 提出するときは、相手の様式の言い回しに合わせて写す。**その時点の実装と食い違っていないか、根拠の欄の資料を見直してから出す。**「オーナー確認」と書いた項目は、管理画面で確かめてから答える。
- このリポジトリは公開されている。**相手の会社名・担当者・連絡先・提出した回答そのものは、ここに置かない。**
- 法的な判断（委託に当たるか、何を契約に書くか）は、専門家に確かめる。
- 実装を変えたら、同じ PR でこの回答も直す。

**前提（必ず最初に伝えること）**

| 項目 | 事実 |
|---|---|
| 運営の体制 | **個人 1 名**（開発・運用・管理を兼ねる）。法人ではない |
| いまの用途 | 1 つの披露宴（約 100 名）のための、招待制のサイト。**法人への提供の実績は無い** |
| テナントの分離 | **無い**（1 つの式の専用の構成）。複数の式・複数の会社で使う設計は検討中（Issue #107） |
| ホスティング | Vercel の Hobby プラン（**非商用の個人利用に限られる**）。商用で提供する前に Pro 以上へ変える（[commercial-readiness.md](commercial-readiness.md) §1） |
| 稼働率の保証（SLA） | **無い** |

## 1. 体制・規程

| 質問の例 | 区分 | 回答 | 根拠 |
|---|---|---|---|
| 情報セキュリティの責任者は決まっているか | 一部実施 | 運営者 1 名が責任者を兼ねる。組織としての任命や委員会は無い | — |
| 情報セキュリティの規程・方針はあるか | 一部実施 | 開発と運用の決まりを文書にしている（API・データ・秘密・インフラ・取り消せない操作の禁止）。社内規程の形（承認・改訂の記録・従業者への周知）ではない | `CLAUDE.md`、`.claude/rules/` |
| 従業者への教育・誓約 | 対象外 | 従業者はいない | — |
| 職務の分離（開発と運用、申請と承認） | **未実施** | 1 名がすべてを行う。補う仕組みは、変更の履歴（PR・コミット）、自動の検査（CI）、消せない監査ログ。第三者の確認は入っていない | [certification-roadmap.md](certification-roadmap.md) §4 |
| 第三者認証（ISMS・P マーク・SOC 2 など） | **未実施** | 取得していない。要否と時期は未定 | [certification-roadmap.md](certification-roadmap.md) §3 |
| 第三者による脆弱性診断 | **未実施** | 受けていない。時期は未定（機能の追加が落ち着いたあとを想定） | [certification-roadmap.md](certification-roadmap.md) §2 |
| 内部監査・定期の点検 | 一部実施 | 秘密の棚卸しと、運用アカウントの確認を、四半期に一度と披露宴の 1 か月前に行う決まり（初回は 2026-10-12）。独立した監査ではない | [secrets-inventory.md](../security/secrets-inventory.md) §5、[account-checklist.md](../security/account-checklist.md) §5 |

## 2. アクセス制御（利用者）

| 質問の例 | 区分 | 回答 | 根拠 |
|---|---|---|---|
| 利用者ごとに見える範囲を分けているか | 実施済み | 招待制。承認されたゲストにタグ（所属）を付け、投稿の公開範囲のタグと重なる人だけが読める。データベースの Security Rules で強制している（画面で隠すだけではない）。書かれていないパスは、すべて拒否 | `infra/firestore/firestore.rules`、`.claude/rules/data.md` |
| 個人情報へのアクセスを最小にしているか | 実施済み | 本名・出欠・アレルギーは、本人と管理者だけが読める別の場所に置く。ほかのゲストに見えるのは、ニックネーム・アイコン・タグだけ。運営のメモは管理者だけ | [data-inventory.md](../privacy/data-inventory.md) §2 |
| 権限の設定を検証しているか | 実施済み | Rules の単体テスト（約 300 ケース。許可と拒否の両方）を、Rules を変える PR のたびに CI で動かす | `infra/firestore/test/`、`.github/workflows/rules-test.yml` |
| 管理者の権限は限定されているか | 一部実施 | 管理者（新郎新婦）の権限は、運営者が手元のコマンドでだけ付けられる（API からは変えられない）。**管理者の中の役割分け（閲覧だけ・担当者など）は無い** | `app/web/scripts/make-admin.mjs`、Issue #107 |
| 退会・権限の剥奪はすぐ反映されるか | 実施済み | タグを外す・停止すると、サーバーがログインを失効させる。API は失効をその場で確かめる。データベースを直接読む経路は、手元のトークンの期限（最長 1 時間）まで残る | [incident-response.md](../ops/incident-response.md) §3 |
| 総当たりへの対策 | 実施済み | すべての API にレート制限。招待の合言葉は、5 回の失敗で 30 分、2 度めで永久にロック（解除は管理者）。手前に Vercel の Firewall（IP ごとの流量の制限） | `.claude/rules/api.md`、`CLAUDE.md` ルール 19 |

## 3. 認証

| 質問の例 | 区分 | 回答 | 根拠 |
|---|---|---|---|
| 利用者の認証の方式 | 実施済み | LINE ログイン（LIFF）。LINE の ID トークンをサーバーが検証し、Firebase Authentication のトークンに引き換える。**このサービスは、パスワードを預からない** | `.claude/rules/api.md` |
| 多要素認証（利用者） | 対象外 | LINE のアカウントの保護に依存する。このサービスの側に、追加の要素は無い | — |
| SSO（SAML / OIDC）・ID 連携 | **未実施** | LINE だけ。法人の担当者向けの認証は検討中 | Issue #107 |
| パスワードの方針（長さ・有効期限・ロック） | 対象外 | パスワードが無い。招待の合言葉のロックは §2 | — |
| セッションの管理 | 実施済み | Firebase の ID トークン（1 時間で切れ、自動で更新）。権限を変えたときは、更新用のトークンを失効させる。API は失効のチェックつきで検証する。アプリ自身は Cookie を使わない | [data-inventory.md](../privacy/data-inventory.md) §3 |
| 運用アカウントの多要素認証 | 実施済み | GitHub・Google（GCP / Firebase）・Vercel・Cloudflare・LINE Developers・Sentry・AWS・Modal の 8 つで有効（認証アプリ。2026-10-12 確認）。セキュリティキーへの切り替えは検討中 | [account-checklist.md](../security/account-checklist.md) §1 |
| 特権アカウントの共有 | 実施済み | 運営者 1 名だけが持つ。共有していない | [account-checklist.md](../security/account-checklist.md) §2 |

## 4. 暗号化・鍵の管理

| 質問の例 | 区分 | 回答 | 根拠 |
|---|---|---|---|
| 通信の暗号化 | 実施済み | すべて HTTPS（TLS）。証明書と HSTS は Vercel と Cloudflare が管理する。**TLS の版と暗号の組み合わせは各社の既定で、こちらでは指定していない** | `.claude/rules/platform.md` |
| 保存データの暗号化 | 一部実施 | Firestore・Cloud Storage・R2 は、各社の既定の暗号化（サービス側が鍵を管理）。**自分で鍵を管理する方式（CMEK）や、アプリの側での項目ごとの暗号化は、していない** | — |
| 秘密情報（鍵・トークン）の保管 | 実施済み | 本番の秘密は、Vercel の環境変数（Sensitive・Production だけ）、Worker と Modal はそれぞれの Secret に置く。コード・ログ・コミットに書かない。一覧と入れ替えの手順書がある | [secrets-inventory.md](../security/secrets-inventory.md)、[rotation-runbook.md](../security/rotation-runbook.md) |
| 鍵のローテーション | 一部実施 | 周期を決めてある（サービスアカウントの鍵は 90 日、ほかは 180 日。披露宴の 1 か月前にも）。初回は 2026-10-12 に実施。**自動ではなく手作業** | 同上 |
| 長期の鍵をなくす取り組み | 一部実施 | サービスアカウントの鍵を、短命のトークン（Vercel の OIDC と GCP の Workload Identity Federation）に置き換える方針を決めた。**実装はまだ**（試作を 2026 年内、移行は 2027-02 末までの予定） | [keyless-service-account.md](../security/keyless-service-account.md) |
| 秘密の混入の検査 | 実施済み | CI の gitleaks が、PR の差分と、毎週の履歴全体を検査する。GitHub の Secret scanning と Push protection も有効 | `.github/workflows/security.yml`、[account-checklist.md](../security/account-checklist.md) §3 |

## 5. ログ・監視

| 質問の例 | 区分 | 回答 | 根拠 |
|---|---|---|---|
| 操作の記録（監査ログ） | 実施済み | 更新系の API のすべてで、「誰が・いつ・何を・どの項目を」を記録する（値は入れない。IP は仮名にする）。追記だけで、更新・削除の経路は無い。保持は 400 日 | `.claude/rules/api.md`、[data-inventory.md](../privacy/data-inventory.md) §4 |
| ログの改ざんの防止 | 実施済み | 監査ログを毎日、別の保管場所（GCS）に写す。保持のポリシーはロック済みで、400 日たつまで、運営者にも消せない | [backup-restore.md](../ops/backup-restore.md) §5 |
| 個人情報の閲覧の記録 | 一部実施 | 本名・アレルギー・顔の記録の読み取りを、GCP の Data Access ログに 400 日残す。**この保管場所は、まだロックしていない** | 同上 |
| 利用者（法人の担当者）がログを見られるか | **未実施** | 管理画面に、監査ログを見る機能は無い。運営者がコマンドで取り出す | Issue #107 |
| エラーの監視 | 一部実施 | API の想定外の失敗と、ブラウザの CSP 違反が Sentry に届く（個人を特定できる値は、送る前に落とす）。**通知のルールは未設定**（案は文書にある） | [alerting.md](../ops/alerting.md) §2・§3 |
| セキュリティのアラート | 一部実施 | 鍵の作成・IAM の変更・監査ログの写しの失敗を知らせるアラートを、Terraform に書いてある。**まだ適用していない（通知は 0 件）** | [alerting.md](../ops/alerting.md) §4 |
| 死活監視 | **未実施** | 外部からの死活監視は無い。確認用の入口（`/api/health`）はある。時期は未定 | [alerting.md](../ops/alerting.md) §5 |
| アプリのログの保持 | 一部実施 | 監査ログは 400 日。**Vercel の関数のログは短い**（公式の資料では、Hobby は 1 時間、Pro は 1 日、有料の追加機能で 30 日）。Sentry と Cloudflare の保持は、プランと設定による（オーナー確認） | [Vercel: Runtime Logs](https://vercel.com/docs/logs/runtime) |

## 6. 脆弱性の管理

| 質問の例 | 区分 | 回答 | 根拠 |
|---|---|---|---|
| 依存するソフトウェアの脆弱性の確認 | 一部実施 | CI で `npm audit`（本番に入る依存の high 以上で失敗）と OSV-Scanner（警告）。PR ごとと毎週。Dependabot が、脆弱性の修正の PR を出す（Rules のテスト用の依存も対象）。例外は、理由と 90 日以内の期限が必須（いまは 0 件）。修正版の無い指摘（開発用の依存と、音声合成の Python の依存に1件）は、影響を確かめて残している。**GitHub の Dependabot の通知との突き合わせは済んでいない**（Issue #116） | `.github/workflows/security.yml`、`.github/audit-ignore.json` |
| コードの静的な検査 | 実施済み | Semgrep（指摘があれば PR を失敗にする）、Terraform は Checkov | 同上 |
| 第三者の脆弱性診断・ペネトレーションテスト | **未実施** | 受けていない（§1） | [certification-roadmap.md](certification-roadmap.md) §2 |
| 脆弱性の報告の窓口 | 実施済み | 方針と連絡先を公開している（`/.well-known/security.txt`）。受領の返信は 3 営業日以内が目安。報奨金は無い | [disclosure-policy.md](../security/disclosure-policy.md) |
| 修正の期限 | 一部実施 | 本番に入る依存の high 以上は、CI が赤になるので、直すまでマージしない運用。**重大度ごとの修正の期限は、決めていない** | — |
| Web の一般的な攻撃への対策 | 実施済み | CSP を強制（リクエストごとの nonce）、`X-Frame-Options: DENY`、`nosniff`、`Referrer-Policy`、`Permissions-Policy`。API は本文の大きさ・型・長さを検証する。エラーの詳細を応答に出さない。外部の画像の取得は、許可したホストだけ（SSRF 対策） | [csp-check.md](../security/csp-check.md)、`.claude/rules/platform.md`、`.claude/rules/api.md` |
| WAF・DDoS 対策 | 一部実施 | Vercel の Firewall（DDoS の緩和は標準。AI ボットの遮断と、API の流量の制限を設定済み）。**OWASP のルールセットなどの管理されたルールは、使っていない** | `CLAUDE.md` ルール 19 |
| サプライチェーンへの対策 | 実施済み | GitHub Actions はコミットの SHA で固定。CI のジョブに秘密を渡さない。直接ダウンロードするバイナリは、版とチェックサムを固定 | `.github/workflows/security.yml` |

## 7. バックアップ・可用性

| 質問の例 | 区分 | 回答 | 根拠 |
|---|---|---|---|
| データベースのバックアップ | 実施済み | Firestore の PITR（過去 7 日の任意の時点）と、定期バックアップ（日次を 7 日、週次を 14 週） | [backup-restore.md](../ops/backup-restore.md) §1 |
| 復旧のテスト | 一部実施 | PITR からの複製を 1 回試し、件数が合うことを確かめた（2026-10-12。複製に約 12 分）。**定期バックアップからの復元と、本番への書き戻しは、試していない** | [backup-restore.md](../ops/backup-restore.md) §7 |
| RPO / RTO | 一部実施 | 目安はある（7 日以内の事故なら、RPO は分単位）。RTO は、複製の時間しか測っていない。**約束できる値ではない** | [backup-restore.md](../ops/backup-restore.md) §2 |
| 写真（ファイル）のバックアップ | **未実施** | 写真（Cloudflare R2）には、バックアップもバージョニングも無い。方針（複製する・削除を禁止する）は未決定 | [backup-restore.md](../ops/backup-restore.md) §4 |
| 冗長化・単一障害点 | 一部実施 | 各社のマネージドサービスの冗長性に依存する。データベースは東京の 1 リージョン。**運営者が 1 名であることが、いちばんの単一障害点** | Issue #107 |
| 稼働率の目標・SLA | **未実施** | 定めていない。実績の計測もしていない | [commercial-readiness.md](commercial-readiness.md) §2 |
| 検証用の環境 | 一部実施 | 手元のエミュレーター（本番につながらない）で確認する。Vercel の Preview には本番の秘密を入れていないので、ログインなどは動かない。**本番と同じ構成の検証環境は無い** | [secrets-inventory.md](../security/secrets-inventory.md) §4 |

## 8. 委託先（外部のサービス）の管理

| 質問の例 | 区分 | 回答 | 根拠 |
|---|---|---|---|
| 再委託先・利用するサービスの一覧 | 実施済み | LINE、Google（Firebase・Google Cloud・Vertex AI）、Cloudflare、AWS（Rekognition）、Vercel、Sentry、Modal。用途・渡る情報・所在地を一覧にしている | [subprocessors.md](../privacy/subprocessors.md) |
| データの保管場所（国） | 一部実施 | データベースと監査ログは東京（asia-northeast1）。**日本の外で処理・保管されるものがある**: Vercel（関数の場所は未確認。既定は米国）、Sentry・Modal（米国）、Firebase Authentication（Google の運用）、R2 と Rekognition（場所は未確認） | [subprocessors.md](../privacy/subprocessors.md) §1、[data-inventory.md](../privacy/data-inventory.md) §7 |
| 委託先との契約（DPA など） | **未実施** | 各社の利用規約とデータ処理の条項の範囲で使っている。**個別の契約・プランの確認は、していない** | [subprocessors.md](../privacy/subprocessors.md) |
| 委託先の評価 | 一部実施 | 各社の公開資料（セキュリティ・プライバシーのページ）へのリンクを一覧にしている。点検や評価の記録は無い | 同上 |
| AI・機械学習への利用 | 一部実施 | 写真の顔の検出で、写真（軽量版）を AWS Rekognition に送る。管理者の AI の試験で、ゲストの呼び名・本名・運営のメモを Vertex AI に送る（ゲストが使う AI の機能は無い）。**AWS の「AI サービスのオプトアウト」の設定は未確認** | [data-inventory.md](../privacy/data-inventory.md) §6・§7 |

## 9. インシデント対応

| 質問の例 | 区分 | 回答 | 根拠 |
|---|---|---|---|
| 対応の手順 | 実施済み | 重大度の区分、最初の 15 分、封じ込め、証拠の保全、連絡、事後レビューのひな形を文書にしている | [incident-response.md](../ops/incident-response.md) |
| 顧客への連絡 | 一部実施 | 提供先の会社あての第一報のひな形がある。**連絡までの時間は、約束していない**（契約で決める） | [incident-response.md](../ops/incident-response.md) §5 |
| 訓練 | **未実施** | 机上の訓練を、年に一度と披露宴の 1 か月前に行う決まり。まだ行っていない | [incident-response.md](../ops/incident-response.md) §8 |
| 対応の体制（時間） | 一部実施 | 運営者 1 名。24 時間の体制ではない | — |
| 過去のインシデント | 実施済み | 個人情報の漏えいは、把握している範囲で無い。2026-10-12 に、鍵の入れ替えの作業に伴う本番の障害があり、経過を記録している | [rotation-runbook.md](../security/rotation-runbook.md)「2026-10-12 の作業と障害」 |

## 10. データの取り扱い・削除

| 質問の例 | 区分 | 回答 | 根拠 |
|---|---|---|---|
| 取得する個人情報 | 実施済み | 一覧にしている: 本名・ふりがな・出欠・アレルギー・備考、LINE のユーザー ID・表示名・アイコン、投稿と写真、顔の位置と照合用の特徴、原本の写真の EXIF（位置情報が入りうる）。LINE から取るのは ID トークンの中身だけ（友だち・トーク・メールアドレスは取らない） | [data-inventory.md](../privacy/data-inventory.md)、[subprocessors.md](../privacy/subprocessors.md) §2 |
| 利用目的・プライバシーポリシー | **未実施** | 文面の案はある。**未承認で、アプリの中にページも無い** | [privacy-policy-draft.md](../privacy/privacy-policy-draft.md) |
| 保存期間 | **未実施** | **決まっていない。**ゲストのデータは、消すまで残る（自動で消えるのは、ログとバックアップだけ）。案は 3 つある | [deletion-runbook.md](../privacy/deletion-runbook.md) §4 |
| 削除の依頼への対応 | 一部実施 | 1 人分を消す手順書がある（データベース・写真・顔の特徴・ログインのアカウント）。**通しで試していない。手作業で、一部は横断して探せない** | [deletion-runbook.md](../privacy/deletion-runbook.md) §2・§6 |
| 削除しても残るもの | 一部実施 | 文書にしている: 投稿を消すと、公開側の写真と顔の特徴は消える（Issue #122）。非公開の原本は残る（Issue #159）。配信のキャッシュは自動では消さない。バックアップに最長 14 週。監査ログは 400 日（消せない） | [data-inventory.md](../privacy/data-inventory.md) §5 |
| 契約終了時の返却・消去 | **未実施** | すべてを消す順番は書いてある。**消去の証明の様式や、返却の形式は、決めていない** | [deletion-runbook.md](../privacy/deletion-runbook.md) §4 |
| 位置情報の扱い | 一部実施 | 写真の原本は非公開の場所に置き、EXIF を落とした複製だけを公開する。**動画は、位置情報がついたまま公開側に出ている**（Issue #29） | `.claude/rules/media.md`、Issue #29 |
| 公開側の写真へのアクセス | 一部実施 | 公開側の写真は、推測しにくい URL だが、**URL を知っていればログインなしで開ける**（改善は Issue #123） | [data-inventory.md](../privacy/data-inventory.md) §3 |
| データの目的外の利用・第三者への提供 | 実施済み | 広告・解析のタグは入れていない。外部に渡るのは §8 のサービスだけ | [subprocessors.md](../privacy/subprocessors.md) |

## 11. 開発プロセス

| 質問の例 | 区分 | 回答 | 根拠 |
|---|---|---|---|
| ソースコードの管理 | 実施済み | GitHub。`main` は保護（PR が必須、force push と削除を禁止）。**リポジトリは公開**（秘密と個人情報は入れない決まり） | [account-checklist.md](../security/account-checklist.md) §3 |
| 変更のレビュー | 一部実施 | 変更は PR で行い、CI（型・秘密の混入・依存の脆弱性・静的な検査・Rules のテスト）を通す。実装には AI のコーディング支援（Claude Code）を使い、運営者が PR を確かめてマージする。**運営者のほかに、人のレビュアーはいない** | `CLAUDE.md`「Issue の実装」 |
| テスト | 一部実施 | 自動のテストがあるのは、データベースの Rules だけ。**アプリ本体のテストは無い**（型チェックとビルドの通過が最低ライン） | `CLAUDE.md`「コマンド」 |
| 本番への反映の統制 | 一部実施 | `main` へのマージが、そのまま本番のデプロイになる。**デプロイは CI の結果を待たない**ので、PR の上で確かめてからマージする運用で補う。インフラ（Rules・インデックス・バックアップ）は Terraform で、適用は運営者だけ | `CLAUDE.md`「デプロイとインフラ」 |
| 環境の分離 | 一部実施 | 開発はエミュレーター（別のプロジェクト名で、本番に届かない）。**本番のほかに、常設の検証環境は無い** | `CLAUDE.md`「コマンド」 |
| 本番のデータを開発で使わないか | 実施済み | エミュレーターの初期データは作りもの。本番の秘密は、開発機と Preview に置かない方針（開発機に残っているものは見直し中） | [secrets-inventory.md](../security/secrets-inventory.md) §4 |
| 取り消せない操作の統制 | 実施済み | データベースの削除保護、Terraform の `prevent_destroy`、原本と監査ログを消す経路を持たない作り | `CLAUDE.md` ルール 18 |

## 12. 答えにくい質問（正直に書く）

様式に当てはめにくいが、聞かれたら隠さずに答えるもの。

- **「24 時間 365 日の監視体制はあるか」** → 無い。運営者 1 名。通知のルールも設定の途中。
- **「従業者の退職時のアカウントの削除」** → 従業者がいないので対象外。運営者が動けなくなったときの引き継ぎ先は、決まっていない。
- **「データは国内に保管されるか」** → データベースは東京。ただし、配信とエラーの報告などで、日本の外のサービスを通る・置かれるものがある（§8）。
- **「ソースコードは非公開か」** → 公開している。秘密と個人情報は入れていない。
- **「障害時の補償はあるか」** → 契約が無いので、定めていない。
