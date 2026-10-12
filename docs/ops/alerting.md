# 監視とアラート（Issue #104）

最終更新: 2026-10-12

何が起きたら知らせてほしいか、いま何で気づけるか、まだ気づけないものは何か。運用者は 1 人なので、**通知は「来たら必ず見る」ものだけに絞る**（多すぎる通知は、見なくなる）。

通知が来たあとの動きは [incident-response.md](incident-response.md)。

## 1. どこに何が出るか

| 場所 | 出るもの | 通知 |
|---|---|---|
| Sentry | API の想定外の失敗（`console.error`）、未捕捉の例外、レート制限の超過、監査ログの書き込み失敗、パスコードの永久ロック、CSP の違反、ブラウザのエラー | Sentry のアラート（§3。**オーナーが設定する**） |
| GCP（Cloud Logging・Monitoring） | 監査ログのエクスポートの失敗、サービスアカウントの鍵の作成、IAM の変更、個人情報の閲覧ログ | Terraform のアラート（§4。**apply するまで無い**） |
| Firestore の `auditLogs` | 更新系の API の「誰が・いつ・何を」、管理 API への権限違反 | 無し。`node scripts/ops.mjs audit` で見る |
| Vercel | 関数のログ（保持は短い）、Firewall の発動 | 無し。管理画面で見る |
| Cloudflare | Worker（`wedding-exif-stripper`）のログ | 無し。`npx wrangler tail` か管理画面で見る |

**アプリ（Vercel の関数）のログは、GCP には届かない。**GCP のアラートで拾えるのは、GCP の中で起きたことだけ。

## 2. 知らせてほしいイベント

| # | イベント | なぜ | いまの信号 | 通知の手段 | 状態 |
|---|---|---|---|---|---|
| 1 | 5xx の増加 | 本番が壊れている（鍵・環境変数・外部サービス） | 各ルートの `console.error` と未捕捉の例外が Sentry に届く。タグ `route`・`request_id` | Sentry のルール A・B | ルールは未設定 |
| 2 | 監査ログの書き込み失敗（503） | 更新系の API が全部止まる（fail-closed）。Firestore の障害か、鍵の問題 | Sentry の例外。タグ `stage:audit-begin` | Sentry のルール C | ルールは未設定 |
| 3 | レート制限の発動の急増 | 総当たり・スクレイピング・不具合のループ | Sentry のメッセージ `[rate-limit] <ルート名> で上限超過が発生しています`（warning。同じルート・同じ窓では 1 回だけ） | Sentry のルール D | ルールは未設定 |
| 4 | パスコードのロックの多発 | 合言葉の総当たり | **永久ロック**は `console.error`（`[guest/passcode] 永久ロック`）で Sentry に届く。30 分のロックと不一致は `console.warn` で、Sentry に届かない | Sentry のルール E（永久ロックだけ） | ルールは未設定。一時ロックは §5 |
| 5 | 認証失敗の急増 | 盗まれた・偽のトークンでの試行 | **信号が無い。**関所（`route-guard.ts`）の 401 は、ログにも Sentry にも出ない。管理 API への権限違反（403）だけが `auditLogs` に残る | 無し | §5 |
| 6 | Worker の停止 | 高画質版が公開されない。原本が溜まる | **信号が無い。**Worker のログは Cloudflare にだけ出る。webhook を受ける側（`/api/hooks/original-published`）が失敗すれば Sentry に出るが、Worker が動いていないときは何も出ない | 無し | §5 |
| 7 | 監査ログのエクスポートの失敗 | 改ざんできない写しが、その日だけ欠ける | Cloud Scheduler のエラーログ | Terraform のアラート 1 | apply 待ち |
| 8 | サービスアカウントの鍵の作成 | ローテーション以外で作られたら、アカウントが破られた疑い | GCP の管理アクティビティの監査ログ | Terraform のアラート 2 | apply 待ち |
| 9 | プロジェクトの IAM・監査設定の変更 | 権限の付与や、閲覧ログの停止 | 同上 | Terraform のアラート 3 | apply 待ち |
| 10 | CSP の違反（知らないホスト） | XSS の試み、または設定の漏れ | Sentry（`report-uri`） | 定期の確認（[csp-check.md](../security/csp-check.md) §4-3） | 手動 |

1〜6 が Issue #104 に書かれたもの。7〜9 は、GCP 側で拾えるものとして足した。

## 3. Sentry のアラートルール（案。オーナーが設定する）

Sentry → Alerts → Create Alert。通知先はメール（Sentry の通知設定）。**プランによって、使える種類（件数のしきい値で発火する Metric Alert など）が違う。**下は、Issue Alert（イベントの条件で発火）で書いた。使えない条件があれば、近いものに置き換えて、置き換えた内容をこの表に書く。

環境は、すべて `production` に絞る（Preview と開発の報告を混ぜない）。

| ルール | 条件 | 絞り込み | 通知の頻度 |
|---|---|---|---|
| A. 新しいエラー | A new issue is created | level が error 以上 | すぐ。同じ issue は 1 時間に 1 回まで |
| B. エラーの急増 | The issue is seen more than **20 times in 1 hour** | level が error 以上 | 1 時間に 1 回まで |
| C. 監査ログの書き込み失敗 | An event is seen（1 件でも） | タグ `stage` が `audit-begin` | すぐ。30 分に 1 回まで |
| D. レート制限の発動 | The issue is seen more than **5 times in 1 hour** | メッセージに `[rate-limit]` を含む | 1 時間に 1 回まで |
| E. パスコードの永久ロック | An event is seen（1 件でも） | メッセージに `永久ロック` を含む | すぐ |

- しきい値（20 回・5 回）は、ゲストが 100 人・ふだんはほぼ無風、という前提の初期値。**当日は投稿が集中するので、B と D は多めに鳴る。**当日の前に見直す。
- D の回数は、実際の 429 の数ではない。同じルート・同じ 60 秒の窓では、関数のインスタンスごとに 1 回しか送らない（`route-guard.ts` の `notifyRateLimited`）。「複数の窓にまたがって続いている」ことの目安として使う。
- Vercel の Firewall（`api-flood-guard`）で止まったリクエストは、関数に届かないので、Sentry には出ない。Vercel の管理画面の Firewall で見る。

**テスト通知（受け入れ条件）:** ルールを作ったら、Sentry のルールの画面の「Send Test Notification」で、メールが届くことを確かめる。結果を §7 に書く。

## 4. GCP のアラート（Terraform。`infra/terraform/alerting.tf`）

| アラート | 条件 | 来たら |
|---|---|---|
| 1. 監査ログのエクスポートに失敗 | Cloud Scheduler のジョブ `audit-log-export` のエラーログ | 下の「監査ログのエクスポート」 |
| 2. サービスアカウントの鍵が作られた | `CreateServiceAccountKey` | 自分のローテーションでなければ、[incident-response.md](incident-response.md) の封じ込めへ |
| 3. プロジェクトの IAM・監査設定が変更された | プロジェクトの `SetIamPolicy` | 自分の `terraform apply` でなければ、同上 |

- 通知先は、`terraform.tfvars` の `alert_email`（Git に入れない）。**空のうちは、通知チャネルもアラートも作られない。**
- 同じ内容の通知は、1 時間に 1 回まで。
- 鍵のローテーションと、IAM を変える `terraform apply` では、自分の作業でも通知が来る（それで正しい。来なければ、アラートが壊れている）。

**有効にする手順（オーナー）**

```bash
bash scripts/ensure-gcloud-auth.sh
cd infra/terraform
# terraform.tfvars に 1 行足す（値は Git に入らない）:  alert_email = "<通知先のアドレス>"
terraform plan     # 追加: API 1・通知チャネル 1・アラート 3・バックアップ 2。削除・置き換えが無いことを見る
terraform apply
```

apply のあと、**通知先に届く確認メールのリンクを押す**（押すまで通知は届かない）。

**テスト通知（受け入れ条件）:** Cloud Console → Monitoring → Alerting → Edit notification channels → 該当のメール → 「Send test notification」。届いたことを §7 に書く。次に鍵をローテーションしたとき、アラート 2 が届くことも見る。

### 監査ログのエクスポート

アラート 1 は、Scheduler が Firestore のエクスポートを**呼べなかった**ときに鳴る。呼んだあとのエクスポート自体の失敗は拾えないので、月に一度と、アラートが来たときに、当日のフォルダがあることを見る。

```bash
gcloud storage ls "gs://<PROJECT_ID>-audit-archive/" | tail -5      # 毎日 1 つ、UTC 18:00 ごろのフォルダが増えている
gcloud scheduler jobs describe audit-log-export --location=asia-northeast1 --project="<PROJECT_ID>" \
  --format="yaml(state,lastAttemptTime,status)"
```

欠けていた日は、手で 1 回流す: `gcloud scheduler jobs run audit-log-export --location=asia-northeast1 --project="<PROJECT_ID>"`。Firestore の `auditLogs` 自体は 400 日残るので、あとからでも写せる。

## 5. まだ気づけないもの（別 Issue の候補。今回はコードを変えていない）

| 足りないもの | 案 |
|---|---|
| 認証失敗（401）の急増 | 関所の 401 を数える。1 件ずつ Sentry に送ると枠を使い切るので、レート制限と同じく「窓ごとに 1 回」にするか、`rateLimits` と同じ形のカウンタを持つ |
| パスコードの一時ロック（30 分）の多発 | ロックに入ったときだけ `console.error` にする（不一致の 1 回ごとは `warn` のまま）。uid は伏せ字にされる（`sentry-scrub.ts`） |
| Worker の停止 | Worker の実行の最後に、生存の印（時刻）を R2 か Firestore に書き、古くなっていたら知らせる。または、外部の死活監視で `/api/health` と合わせて見る |
| サイトそのものが落ちている | 外部の死活監視（無料の監視サービスなど）で `https://wedding.sw-lab.net/api/health` を 5 分ごとに見る。Sentry も Vercel の中から送るので、Vercel ごと落ちると何も届かない |
| 管理 API への権限違反（403） | `auditLogs` に `admin.denied` として残っている。`node scripts/ops.mjs audit --denied` を定期の確認に入れる（§6） |
| エクスポートの完了 | §4 の手作業の確認。自動にするなら、バケットに 26 時間以上新しいオブジェクトが無いことを見る指標のアラート |

## 6. 定期の確認（通知に頼らないもの）

週に一度（招待状を配ってから当日までは毎日）:

```bash
cd app/web
node scripts/ops.mjs audit --denied        # 管理 API への権限違反
node scripts/ops.mjs audit --incomplete    # 開始だけで終了が無い操作（途中で落ちた）
node scripts/ops.mjs ratelimit             # 直近の窓の使用状況
cd ../.. && python3 scripts/pii-access-report.py   # 個人情報の閲覧（管理者以外・拒否された読み取り）
bash scripts/infra-verify.sh               # Worker・R2・webhook の設定
```

Sentry の未解決の issue と、[csp-check.md](../security/csp-check.md) §4-3 の違反レポートも見る。

## 7. 記録

| 日付 | 何をした（ルールの設定・テスト通知・しきい値の変更） | 結果 | 実行した人 |
|---|---|---|---|
| | | | |
