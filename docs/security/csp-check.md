# CSP の確認と切り戻し（Issue #103）

最終更新: 2026-10-12

ページの Content-Security-Policy（CSP）が強制のまま正しく動いていることを確かめる手順と、壊れたときの戻し方。実装は `app/web/src/lib/csp.ts`（組み立て）と `app/web/src/proxy.ts`（リクエストごとの nonce）。決まりは CLAUDE.md のルール 13・14 と `.claude/rules/platform.md`。

## 1. いまの状態

- **本番は強制（enforce）で動いている。** 2026-10-04 に Issue #9 で切り替えた（コミット `6fab693`）。Issue #103 が書かれた時点の「Report-Only」は、すでに過去の状態。
- 2026-10-12 に `python3 scripts/csp-verify.py` を実行し、すべて PASS（`/invitation`・`/admin` が enforce、`<script>` の全部に同じ nonce、リクエストごとに nonce が変わる、`frame-ancestors 'none'`、報告先あり、`/api` は固定の `default-src 'none'`）。
- **切り替えは、環境変数ではなく `src/lib/csp.ts` の定数 `CSP_MODE` で行う。** Issue #103 には「環境変数での切替を維持」とあるが、環境変数にはしない（2026-10-12 オーナー確認）。理由: 切り替えがコミットとして残り、いつから強制したかを履歴で追える。環境変数だと、Vercel の設定を触れる人が、履歴を残さずに CSP を外せる。
- モードを変えるのは、オーナーの指示があるときだけ（ルール 14）。

## 2. 許可リストの点検（2026-10-12）

本番のヘッダと、コードが実際に通信する先を突き合わせた。**不足は見つからなかった。**

| 用途 | 通信先 | ディレクティブ | 入っているか |
|---|---|---|---|
| LINE ログイン（LIFF SDK は npm から同梱） | `api.line.me`・`access.line.me`・LIFF の配信元 | `connect-src https://*.line.me https://*.line-scdn.net`、`frame-src https://*.line.me` | ○ |
| LINE のアイコン | `profile.line-scdn.net`・`obs.line-scdn.net` | `img-src` | ○ |
| Google のアイコン | `lh3.googleusercontent.com` | `img-src` | ○ |
| Firebase（Auth・Firestore） | `identitytoolkit.googleapis.com`・`securetoken.googleapis.com`・`firestore.googleapis.com` | `connect-src https://*.googleapis.com` | ○ |
| 写真・動画の表示 | `wedding-media.sw-lab.net`（旧 `media.wedding.sw-lab.net`） | `img-src`・`media-src`・`connect-src` | ○ |
| 原本のアップロード（署名付き URL へ PUT） | `<アカウント>.r2.cloudflarestorage.com` | `connect-src https://*.r2.cloudflarestorage.com` | ○ |
| Sentry（エラーと CSP 違反の報告） | DSN から作る送信先 | `connect-src`・`report-uri` | ○ |
| 画像の圧縮（Web Worker） | 自前配信の `/vendor/browser-image-compression.js` | `script-src 'self'`、`worker-src 'self' blob:` | ○ |
| フォント（`next/font`。ビルド時に取り込む） | 自サイト | `font-src 'self' data:` | ○ |
| 音声（管理画面。合成はサーバー経由） | `blob:`・`data:`（無音 WAV） | `media-src 'self' data: blob:` | ○ |

**ワイルドカード**は 6 つ: `*.googleapis.com`・`*.line.me`・`*.line-scdn.net`・`*.r2.cloudflarestorage.com`（以上 `connect-src`）、`*.line.me`・`*.firebaseapp.com`・`*.web.app`（`frame-src`）。

絞れるかもしれないもの（**今回は変えていない。**強制中に削ると、使っている機能が本番で止まるため、変えるなら別 Issue で、違反レポートを見ながら行う）:

- `frame-src` の `https://*.firebaseapp.com`・`https://*.web.app`: どの Firebase のサイトでも枠内に読める。ログインは LIFF とカスタムトークンで、コードに `<iframe>` もポップアップのログインも無い。このプロジェクトの `authDomain` だけに絞るか、外せる可能性がある。
- `img-src` の `https://firebasestorage.googleapis.com`・`https://storage.googleapis.com`: 写真は R2 に移っている。コードに残る参照は、サーバー側の URL の検証（`/api/episodes`・`/api/admin/update-guest`・`rekognition.ts`）だけ。古いデータにこのホストの画像が残っていないことを確かめれば外せる。
- `LEGACY_MEDIA_ORIGIN`（`media.wedding.sw-lab.net`）: 旧ドメインを撤去したら消す（`csp.ts` のコメントのとおり）。

## 3. `'unsafe-inline'` と `'unsafe-eval'`

| 場所 | 値 | 理由 |
|---|---|---|
| `script-src` | `'unsafe-inline'` | **新しいブラウザでは効いていない。** nonce と `'strict-dynamic'` があると、ブラウザは `'unsafe-inline'` を無視する。`'strict-dynamic'` を知らない古いブラウザで、ページが真っ白にならないための保険 |
| `style-src` | `'unsafe-inline'` | **効いている。** React が SSR で出す `style="..."` 属性と、framer-motion のスタイルに要る。nonce を入れると `'unsafe-inline'` が無効になり、これらが全部止まる（`csp.ts` の ★）。スタイルの差し込みで起きうるのは見た目の改ざんまでで、スクリプトは動かない |
| `script-src` | `'unsafe-eval'` | **本番には無い。** 開発サーバー（`NODE_ENV=development`）のときだけ付く（React のデバッグ用）。本番のヘッダに無いことを 2026-10-12 に確認 |

- インラインの `<script>`、`dangerouslySetInnerHTML`、`eval`、`new Function` は、`app/web/src` に無い（2026-10-12 に grep で確認）。足さない（ルール 13）。

## 4. 確認のチェックリスト

### 4-1. 外から（Claude Code でも実行できる。読み取りのみ）

```bash
python3 scripts/csp-verify.py                              # いまの状態
python3 scripts/csp-verify.py --expect enforce --wait 900  # デプロイを待ってから判定
```

- [ ] 「判定: すべて PASS」

### 4-2. 画面（オーナーが実機で）

スマホの **LINE アプリ内ブラウザ**と **iOS Safari** の両方で行う。PC の Chrome では、開発者ツールの Console を開いたまま操作し、`Refused to …` / `Content Security Policy` で始まる赤い行が出ないことを見る（スマホでは Console を見られないので、動作と §4-3 のレポートで判断する）。

Preview のデプロイには秘密を入れていないので、ログインより先は確かめられない（[secrets-inventory.md](secrets-inventory.md) §4）。**画面の確認は本番で行う。** CSP を変える PR は、先に `npm run dev:emulator` と PC のブラウザで Console を見る（開発サーバーは `'unsafe-eval'` が付く点だけ本番と違う）。

| 画面 | 操作 | 見ること | 関係するディレクティブ |
|---|---|---|---|
| `/invitation` | 開く → LINE でログイン | ログインが終わり、次の画面へ進む | `script-src`・`connect-src`（LINE・Firebase）・`frame-src` |
| `/onboarding`・`/pending` | 合言葉の入力、登録 | 送信できる | `connect-src 'self'` |
| `/guestbook` | タイムラインを開く、スクロールする | 写真・動画・アイコンが出る | `img-src`・`media-src` |
| `/guestbook`（投稿） | 写真を 1 枚選んで投稿 | 圧縮 → アップロードが終わり、2〜4 分後に高画質版に替わる | `worker-src`・`connect-src`（R2） |
| `/guestbook/posts/[id]` | 写真を開く、コメント、いいね | 表示と書き込みができる | `img-src`・`connect-src`（Firebase） |
| `/guestbook/notifications`・`/guestbook/settings` | 開く、アイコンを見る | 表示される | `img-src` |
| `/guide`・`/guide/guests`・`/guide/payment`・`/guide/questionnaire` | 開く、アンケートを送る | 表示と送信ができる | `connect-src 'self'` |
| `/screen` | プロジェクター用の画面を開く | 写真が切り替わる | `img-src`・`media-src` |
| `/admin`・`/admin/guests`・`/admin/faces`・`/admin/episodes` | 開く、一覧を見る | 表示される | `img-src`・`connect-src` |
| `/admin/ai-test`・音声のテスト | AI の応答、音声の再生 | 音が出る | `media-src`（`blob:`・`data:`） |

- [ ] 上の全部で、表示・操作が止まらない
- [ ] PC の Console に CSP の違反が出ない（ブラウザ拡張機能によるものは除く）

### 4-3. 違反レポート（オーナーが実行。Sentry の読み取りトークンが要る）

トークンは Sentry → User Settings → Personal Tokens で作る（権限は `event:read` だけ）。実行時に入力を求められる（画面に出ない）。保存しない。

```bash
python3 scripts/csp-reports.py --hours 24 --after-nonce   # 直近 24 時間。出てはいけないものを「要確認」にする
python3 scripts/csp-reports.py                            # 直近 14 日
```

- [ ] 「★要確認★」が 0 件

## 5. 違反レポートの分類

| 分類 | 例 | 扱い |
|---|---|---|
| 無視してよい | ブラウザ拡張機能（`chrome-extension:`・`moz-extension:` など）、`vercel.live`（Vercel のツールバー。ログイン中の本人だけ）、`csp-test.invalid`（疎通テスト） | 何もしない |
| 設定の漏れ（正規の通信がブロックされた） | `wedding-media.sw-lab.net` や LINE・Firebase・R2 への通信、`blob:` の Worker、`data:` の音声 | 機能が止まっている。§6 で戻すか、`csp.ts` にホストを足す PR を出す |
| 作りの退行 | インラインスクリプト（`inline`）、`eval`、`apis.google.com`、`cdn.jsdelivr.net` | nonce の付いていないページがある（静的生成に戻った）、ライブラリの読み込み方が変わった、など。直前のデプロイの変更を見る |
| 不正の疑い | 知らないホストのスクリプト、知らない送信先への `connect-src`・`form-action` | CSP が止めたもの。同じ時刻の監査ログ（`node scripts/ops.mjs audit`）と Sentry のエラーを見て、差し込まれた経路（投稿の本文・表示名など）を調べる |

**ノイズが多いときの方針:** まず `csp-reports.py` の `KNOWN`（既知の違反の表）に足して、一覧で「無視してよい」に分ける。それでも Sentry の枠を圧迫するなら、Sentry のプロジェクト設定の Inbound Filters（ブラウザ拡張機能のフィルタ）を有効にする。**`report-uri` を外さない**（不正の兆候が見えなくなる）。

### 記録

| 日付 | 期間 | 件数（無視してよい／設定の漏れ／作りの退行／不正の疑い） | 対応 |
|---|---|---|---|
| 2026-10-12 | 直近 14 日（強制に切り替えた 2026-10-04 をまたぐ） | 3 種類・12 回。無視してよい 2 種類（下の 1・3）／設定の漏れ 0／作りの退行 0／不正の疑い 0。経過を見るもの 1 種類（下の 2） | `csp-reports.py` の `KNOWN` に 1 を足した。許可リストは変えていない |

2026-10-12 の内訳:

1. **`img-src` / `www.google.com`（10 回・7 人。最新 10-12）— 無視してよい。** Firestore の通信ライブラリ（WebChannel。`@firebase/webchannel-wrapper`）が、通信エラーのときに、ネットワークが生きているかを `//www.google.com/images/cleardot.gif` の読み込みで確かめる。アプリのコードには `www.google.com` の画像を読む箇所が無く、複数の人に少しずつ出ていることとも合う（電波の悪い場面）。ブロックされて失われるのは、この到達確認の結果だけで、再接続は別に行われる。**`img-src` には足さない**（機能に要らないホストを許可リストに入れない）。
2. **`connect-src` / `apis.google.com`（1 回・1 人。10-06）— 経過を見る。** 強制のあとの 1 回きりで、以後は出ていない。アプリは `apis.google.com` へ通信しない（ログインは LIFF とカスタムトークンで、gapi を使う経路が無い）。原因は特定できていない（その人のブラウザの拡張機能などの可能性）。ブロックされており、機能への影響の報告も無い。**同じものがまた出たら、作りの退行として調べる。**
3. **`script-src-elem` / `csp-test.invalid`（1 回・1 人。09-30）— 無視してよい。** 強制の前に行った疎通テスト。

## 6. 切り戻し

強制が原因で、正規の機能が本番で止まったとき。**モードの変更はオーナーの指示で行う**（ルール 14）。

### 6-1. 直前のデプロイで壊れたとき（いちばん速い）

CSP 自体ではなく、直前の変更（新しい通信先を使う機能を、許可リストより先に出した、など）が原因のとき。

1. オーナーが、Vercel の管理画面 → Deployments → 1 つ前の Production のデプロイ → **Instant Rollback**。（この手順は、このプロジェクトではまだ試していない。使えなければ、原因のコミットを `git revert` する PR を出す）
2. `python3 scripts/csp-verify.py` と、止まっていた機能を確かめる。
3. 原因の変更を直す PR を出す（許可リストへの追加を、同じ PR か先の PR に入れる）。

### 6-2. Report-Only に戻すとき

原因がすぐに分からず、ブロックをやめて様子を見たいとき。

1. `app/web/src/lib/csp.ts` の `CSP_MODE` を `"report-only"` にする（強制に切り替えたコミットの `git revert` でもよい）。コメントに、日付と理由を書く。
2. PR を出し、CI に赤が無いことを見て、オーナーがマージする（`main` へのマージ = 本番デプロイ）。
3. デプロイを待って確かめる:

   ```bash
   python3 scripts/csp-verify.py --expect report-only --wait 900
   ```

4. 止まっていた機能が動くことを、実機で確かめる。
5. 違反レポート（§4-3）で原因を突き止め、直してから、もう一度 `"enforce"` に戻す PR を出す（`python3 scripts/csp-verify.py --expect enforce --wait 900`）。
6. 戻した日・理由・強制に戻した日を、Issue に残す。

- Report-Only の間は、`frame-ancestors` と `upgrade-insecure-requests` が付かない（Report-Only では無視されるため）。枠内表示の禁止は、`next.config.ts` の `X-Frame-Options: DENY` が引き続き担う。
- `CSP_MODE` は環境変数ではないので、Vercel の環境変数を変えても戻らない。
- Report-Only のまま放置しない。戻している間は、XSS の最後の守りが無い。

### 記録

| 日付 | 何をした（戻した／強制に戻した） | 理由 | 実行した人 |
|---|---|---|---|
| 2026-10-04 | 強制に切り替えた（Issue #9。コミット `6fab693`） | 初回 | オーナー |
