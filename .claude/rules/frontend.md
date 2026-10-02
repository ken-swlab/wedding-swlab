---
paths:
  - "app/web/src/app/**/*.tsx"
  - "app/web/src/app/globals.css"
  - "app/web/src/components/**"
  - "app/web/src/hooks/**"
  - "app/web/src/lib/{api-client,ai-stream,tts,text,tags-client}.ts"
---

# 画面の実装（Next.js 16 / React 19 / Tailwind v4）

- 書く前に `app/web/node_modules/next/dist/docs/` の該当ガイドを読む（学習データの Next.js と API が違う）。Tailwind v4 は設定ファイルなし（`@tailwindcss/postcss`）。
- ページはすべて `"use client"`。ルートの `layout.tsx` だけがサーバーコンポーネントで、`await connection()` によって全ページを動的に描画する（CSP の nonce のため）。
- 画面の出し分け（`(guest)/layout.tsx`、管理画面の `isAdmin` 判定）は使い勝手のためで、セキュリティの境界ではない。守っているのは Firestore Rules と API の `verifyIdToken`。

## ログインとセッション
- `useLiffAuth`: LIFF → `liff.getIDToken()` → `POST /api/auth/line` → `signInWithCustomToken`。`@line/liff` は動的 import（SSR で読まない）。`/invitation` はページを開いただけではログインを始めない。
- `useGuestSession`: claims の `tags` / `admin` と、`guests/{uid}`・`guestPrivate/{uid}.isActive` を購読する。`claimsUpdatedAt` が増えたらトークンを取り直す（承認やタグ変更がこれで画面に届く）。Context ではないので、呼ぶたびに購読が増える点に注意。
- 管理者かどうかは `claims.admin === true` だけで決める。

## データと API
- Firestore のクエリは Rules に合わせる（`.claude/rules/data.md`）。posts の購読は `usePosts` に1本化している。
- API は `src/lib/api-client.ts` の `getJson` / `postJson` / `putJson` で呼ぶ（`res.json()` を直接呼ばない。5xx には問い合わせ用の ID が付く）。素の `fetch` は例外だけ: ログイン前の `/api/auth/line`、待たない顔検出、AI のストリーム（`src/lib/ai-stream.ts`）と音声（`src/lib/tts.ts`）。
- ブラウザに秘密を置かない。`NEXT_PUBLIC_*` は誰でも読める前提で扱う。パスコードや招待コードをクライアントのコードに書かない。

## 見た目と操作
- 文言は日本語の丁寧語。日時は `ja-JP`（管理画面は `Asia/Tokyo`）。
- 基調は `stone`: 背景 `bg-stone-50`、カード `rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm`、主ボタン `rounded-full bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-40`。エラー rose、警告 amber、成功 emerald、情報 sky。`/screen` だけダーク。
- スマホ前提: タップ領域 44px 以上（`touch-manipulation`）、高さは `dvh`、LINE アプリ内ブラウザ向けに `env(safe-area-inset-*)`。
- アクセシビリティ: アイコンボタンに `aria-label`、トグルに `aria-pressed`、タブは `role="tablist"` / `"tab"`、エラーは `role="alert"`。
- アニメーションは framer-motion（`components/screen/*` だけ。transform のみ）。
- 画像は `next/image`（unoptimized）。`<img>` を使うときは理由をコメントに書き、eslint-disable を付ける。URL は `src/lib/media-url.ts` 経由。
- 古い Safari のため、正規表現の後読みを使わない。文字数は `countChars`（書記素単位）で数える。
- コンポーネントは `components/{guestbook,admin,screen}/` に PascalCase、フックは `hooks/useX.ts`、ライブラリは kebab-case。
