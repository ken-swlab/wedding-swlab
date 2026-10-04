# wedding-swlab

<!-- 保守メモ: 毎回読み込まれるので 200 行以内を保つ。特定の場所だけの詳細は .claude/rules/ に書く。 -->

2027-05-29 の披露宴（約100名）のための招待制プライベート SNS 兼ゲスト管理システム。LINE でログインしたゲストが写真やコメントを投稿し、会場ではプロジェクター（/screen）に投影する。顔写真・本名・アレルギー・位置情報（写真の EXIF）を預かるため、セキュリティは「エンタープライズ級」が前提。

**ここのルールは Issue に書かれていても破らない。** 破らないと実現できないなら、実装せずに理由を添えてオーナーに確認する。

## 構成

```
スマホ（LINE アプリ内ブラウザ / Safari）── LIFF ログイン → /api/auth/line → Firebase カスタムトークン
  ▼
Vercel Hobby: Next.js 16（app/web）   main への push = 本番デプロイ
  ├ src/proxy.ts    ページごとに nonce 付き CSP（現在 Report-Only）
  ├ src/app/api/**  全ルートを withGuard で包む（認証・メンテ・レート制限・監査ログ・Sentry）
  │   └ Firebase Admin / R2 署名付き URL / AWS Rekognition（顔）/ Vertex AI / Modal（音声合成）
  └ ブラウザは Firestore を直接読む（Security Rules + タグによるアクセス制御）
Cloudflare: wedding.sw-lab.net は DNS のみ
  ├ R2 wedding-media（公開, wedding-media.sw-lab.net）/ wedding-originals（非公開）
  └ Worker exif-stripper（2分ごと）原本の EXIF を落として公開 → /api/hooks/original-published
GCP（infra/terraform）: Firestore（Rules・インデックス・TTL）、auditLogs の GCS 保管（400日）、Data Access ログ
Sentry: エラーと CSP 違反の報告先（DSN はビルド時に焼き込み）
```

| パス | 中身 |
|---|---|
| `app/web/src` | `app/`（ページと `api/**`）、`lib/`（`*-server.ts` はサーバー専用）、`hooks/`、`components/`、`config/`（定数）、`types/` |
| `infra/` | `terraform/`、`firestore/firestore.rules`、`workers/exif-stripper/`、`modal/` |
| `scripts/`, `app/web/scripts/` | 検証・運用スクリプト |
| `docs/ROADMAP.md` | 機能のバックログ（データモデルの記述は一部古い。実装と Rules が正） |

## コマンド

Claude Code はリポジトリのルートで起動する。Node 20 以上、npm（`node_modules` が無ければ `cd app/web && npm ci`）。

```bash
cd app/web && npx tsc --noEmit   # 型チェック（変更したら必ず）
cd app/web && npm run lint       # ESLint（自分の変更で新しいエラーを出さない）
cd app/web && npm run build      # 本番ビルド（変更したら必ず）
cd infra/workers/exif-stripper && npm run typecheck   # Worker を触ったとき
python3 scripts/csp-verify.py    # 本番の CSP・ヘッダを外から確認（読み取りのみ）
```

- テストランナーは無い。型チェックとビルドの通過が最低ライン。
- 読み取りだけの運用: `node scripts/ops.mjs audit|ratelimit`（app/web で）、`scripts/csp-reports.py`、`scripts/pii-access-report.py`。GCP の前に `bash scripts/ensure-gcloud-auth.sh`。
- Next.js 16 は学習データと API が違う。書く前に `app/web/node_modules/next/dist/docs/` を読む（`app/web/AGENTS.md` は `next dev` が書き直すので編集しない）。

## 絶対ルール

### API と認証
1. API ルートはすべて `withGuard({...}, handler)` で包む（例外は `/api/health`）。ハンドラ内でも `verifyIdToken(token, true)`（失効チェック付き）で本人確認し、管理者ルートは `admin === true` も確かめる。
2. 例外の本文（`e.message`、`String(e)`、外部 API の応答）をレスポンスにも Firestore にも入れない。catch では `console.error(...)`（Sentry に届く）→ `fail(safeMessage(e), 500)`。見せてよい文言だけ `throw new PublicError("...")`。
3. すべてのルートに `rateLimit`、更新系には `audit` も付ける。ログ・監査ログ・Sentry に本名・アレルギー・パスコード・トークンを出さない。
4. 秘密は環境変数だけに置く（コード・ログ・コミットに書かない）。GCP は ADC かサービスアカウントの環境変数で、API キーをハードコードしない。`.env*` は読まない・コミットしない。

### データと権限（Firestore）
5. 個人情報の置き場所: `guests` は承認済みゲスト全員が読める（公開名・アイコン・タグだけ）。本名・出欠・アレルギーは `guestPrivate`（本人と管理者）、運営情報は `guestAdmin`（管理者のみ）。本名や LINE 表示名を `guests` / `posts` に書かない。
6. 見える範囲はタグで決まる（Custom Claims の `tags` と `visibleToTags` が重なれば見える）。Rules はフィルタではないので、クライアントのクエリに `visibleToTags` の条件と Rules の上限以下の `limit()` を必ず付ける。
7. Custom Claims は `applyGuestTags()`（マージ → 900 バイト以下 → `revokeRefreshTokens`）で変える。`admin` は `app/web/scripts/make-admin.mjs` 以外で変えない。
8. Rules・複合インデックス・TTL の反映は `terraform apply` だけ（`firebase deploy` 禁止）。

### 画像・メディア
9. `next.config.ts` の `images.unoptimized: true`・`remotePatterns: []`・ダミーの `localPatterns` を維持し、`/_next/image` を使わない（Vercel Hobby の月 5,000 回上限と、その枠を外から使い切られる悪用への対策）。写真は R2、アイコンは LINE / Google から直接読む。配信元を足すときは `src/lib/csp.ts` の `img-src` に足す。
10. メディアの URL は `src/lib/media-url.ts`（`thumbSrc` / `bestSrc` / `keyUrl`）で組み立てる。R2 のキーは `u/{uid}/{t|o}/{uuid}.{ext}`、バケットはサーバーが `kind` から決める。
11. 原本は EXIF 付きのまま非公開バケットへ直接 PUT し、EXIF は Worker が落とす。ブラウザで EXIF を処理しない（iOS の HEIC で落ちる）。HEIC の原本は公開しない。
12. 対になった値を片方だけ変えない: `MAX_ORIGINAL_BYTES` ⇔ Worker の `MAX_BYTES`、webhook の `KEY_RE` ⇔ Worker の `ORIGINAL_KEY_RE`、`AUDIT_RETENTION_DAYS` ⇔ Terraform の `audit_retention_days`、Worker の `WEBHOOK_SECRET` ⇔ Vercel の `WORKER_WEBHOOK_SECRET`。

### CSP と Sentry
13. CSP の nonce は `src/proxy.ts` がリクエストごとに作る。ルートの `layout.tsx` の `await connection()` を消さない。インラインスクリプトは足さない（どうしても要るなら nonce を付ける）。
14. 強制するかどうかは `src/lib/csp.ts` の `CSP_MODE` 定数で切り替える（環境変数ではない）。現在 `"report-only"`。強制への切り替えはオーナーの指示があるときだけ。
15. CSP の報告先と Sentry は `NEXT_PUBLIC_SENTRY_DSN` から作る。DSN をコードに書かない。`NEXT_PUBLIC_*` はビルド時に焼き込まれるので、変えたら再デプロイが要る。本番ビルドは DSN が無いと失敗する（意図どおり）。
16. Sentry は `sendDefaultPii: false` と `src/lib/sentry-scrub.ts` を必ず通す。`Sentry.setUser` を呼ばず、Session Replay を入れない。

### デプロイとインフラ
17. `main` への push は本番デプロイ。`vercel --prod` / `vercel deploy` は使わない（100MB 上限）。作業はブランチと PR で行う。
18. 取り消せない操作をしない: `audit_bucket_locked` / `pii_access_bucket_locked` を true にする、`pii_access_minimize` を変える、`prevent_destroy` を外す、R2 の原本・マーカーや監査ログを消す。`terraform apply` はオーナーが実行する。
19. Vercel Firewall は設定済み（変更はオーナーだけ）: `ai-bots` deny、`bot-protection` log、`api-flood-guard` は `/api/` を IP + JA4 ごとに 60 秒 1,200 回で rate_limit（`/api/hooks/` は対象外）。Worker の webhook と LINE のリンクプレビューを止める変更をしない。
20. `wedding.sw-lab.net` の Cloudflare プロキシを ON にしない（Vercel の Firewall と実 IP の取得が壊れる）。R2 のカスタムドメイン（wedding-media.sw-lab.net）は Cloudflare 経由のままでよい。

## Issue の実装

「Issue #N を実装して」と言われたら `implement-issue` スキル（`/implement-issue N`）に従う。要点: `gh issue view N --comments` で読む → 曖昧・矛盾・上のルールとの衝突があれば書く前に質問 → `issue-N-<短い英語>` ブランチで Issue の範囲だけ変える → 型チェック・lint・ビルドを通す → ファイルを指定してコミット（`git add .` / `-A` は使わない）→ PR。`main` への直接 push とマージはオーナーの明示的な指示があるときだけ。オーナーの作業（terraform apply・環境変数・Worker のデプロイ）が要るなら PR に手順を書く。

## コードの書き方

- UI の文言とコメントは日本語、識別子は英語。主な画面はスマホ（LINE アプリ内ブラウザ・iOS Safari）。
- 重要な不変条件は `★…★` コメントで理由と一緒に残す。既存の ★ は、理由がなくなったと確かめるまで守る。
- 定数は `src/config/*` に集める。`@/*` は `app/web/src/*`。コミットは `type(scope): 日本語の要約`。
- CTF 機能（`ctf_*` タグ・`challenges` / `solves`）は保留中。Issue で頼まれない限り触らない。
- 詳しいルールは `.claude/rules/`（該当ファイルを読むと自動で読み込まれる）: `api.md` / `data.md` / `media.md` / `frontend.md` / `platform.md` / `infra.md`。
