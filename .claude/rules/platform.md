---
paths:
  - "app/web/next.config.ts"
  - "app/web/src/proxy.ts"
  - "app/web/src/lib/{csp,sentry-scrub}.ts"
  - "app/web/src/app/layout.tsx"
  - "app/web/src/app/global-error.tsx"
  - "app/web/src/instrumentation*.ts"
  - "app/web/src/sentry.*.ts"
  - "scripts/csp-*.py"
---

# CSP・Sentry・セキュリティヘッダ

## CSP（src/lib/csp.ts と src/proxy.ts）
- ページの CSP は `src/proxy.ts` がリクエストごとに nonce を作って付ける。`/api` には `next.config.ts` の固定 CSP（`default-src 'none'`）。proxy の matcher は `api/`・`_next/static`・`_next/image`・`favicon.ico`・`vendor/` を除外。
- `script-src` は `'self' 'nonce-…' 'strict-dynamic' 'unsafe-inline'`（`'unsafe-inline'` は古いブラウザ向けの保険で、新しいブラウザは nonce があると無視する）。
- `style-src` に nonce を入れない（入れると React の `style` 属性と framer-motion が止まる）。
- ルートの `layout.tsx` の `await connection()` を消さない（静的描画になると nonce が付かない）。
- ホストを足すときは `img-src` / `media-src` / `connect-src` のどれかを選んで足す。★強制中なので、足す前にそのホストを使う機能をデプロイすると本番で読み込みがブロックされる★ 足す変更を先に（または同じ PR で）入れ、デプロイ後に `python3 scripts/csp-reports.py --hours 24 --after-nonce` で違反が増えていないことを確かめる。
- 強制への切り替え（オーナーの指示があるときだけ）: `csp-reports.py --after-nonce` の「要確認」が 0 → `CSP_MODE` を `"enforce"` にしてコミット → `python3 scripts/csp-verify.py --expect enforce --wait 900`。戻すときは `git revert`。`frame-ancestors` と `upgrade-insecure-requests` は強制時だけ付く。

## Sentry
- DSN は `NEXT_PUBLIC_SENTRY_DSN` だけ。ブラウザ・サーバー・proxy のバンドルにビルド時に焼き込まれる。コードに DSN を書かない。本番（`VERCEL_ENV=production`）のビルドは DSN が無いと `next.config.ts` が止める。
- 環境名はサーバーが `VERCEL_ENV`、ブラウザが `NEXT_PUBLIC_VERCEL_ENV`。CSP の報告先（Sentry の security エンドポイント）にも `sentry_environment` が付く。
- サーバーは `captureConsoleIntegration({ levels: ["error"] })` で `console.error` をイベントにする。route-guard が付ける `route` / `request_id` タグで API とリクエストを特定できる。
- 全イベントを `src/lib/sentry-scrub.ts` に通す（JWT・LINE の uid・`pre_` uid・メール・署名付き URL の署名・R2 キー内の uid を伏せ、リクエスト本文・Cookie・ユーザー情報を落とす）。このファイルはブラウザでも動く書き方を保つ。
- `sendDefaultPii: false`、`Sentry.setUser` を呼ばない、Session Replay を入れない。
- `@sentry/nextjs` の major を上げるときは、`sentryMajorIsSafe()` の判定と v11 以降の既定値の変化（何でも収集する）を確かめてから。

## next.config.ts
- セキュリティヘッダ: `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy`（camera / microphone / geolocation / payment / usb を無効）、`X-Robots-Tag: noindex, nofollow, noarchive`。
- 画像最適化は使わない: `images.unoptimized: true`、`remotePatterns: []`、ダミーの `localPatterns`（Vercel の新しいビルド経路では `unoptimized` だけだと `/_next/image` が残るため）。
- `/api/health` の `X-Build` はコミットの短縮 SHA。デプロイ完了の確認に使う（本文には何も足さない）。
- HSTS は Vercel が付けるので足さない。
