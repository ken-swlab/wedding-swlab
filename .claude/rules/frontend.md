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
- `useGuestSession`: claims の `tags` / `admin` と、`guests/{uid}`・`guestPrivate/{uid}` の `isActive`・`invitationKind`（Issue #240）・`textScale`（Issue #243）を購読する。`claimsUpdatedAt` が増えたらトークンを取り直す（承認やタグ変更がこれで画面に届く）。Context ではないので、呼ぶたびに購読が増える点に注意。
- 管理者かどうかは `claims.admin === true` だけで決める。
- 起動（Issue #250）: ゲストの画面は Firebase のログイン（端末に残ったもの）だけを見て出し、LINE の確認（`liff.init`）は待たない。LINE アプリの中では、最初の画面のあとに `useLineAccountCheck` が LINE のアカウントと uid を比べ、違えばサインアウトして招待状からログインし直させる。`useGuestSession` は前回のプロフィール（guests の公開して困らない値だけ）を端末に覚え、届くまではそれで行き先を決める（届いた値で上書きする）。
- 最初の画面に要らない部品は `next/dynamic` で使うときに読む（投稿画面・写真のビューア・投稿の詳細・写真の選択・承認後の演出・投稿の編集・画像の圧縮のライブラリ）。重い部品を足すときも同じにする。Sentry は名前を付けて import する（`import * as Sentry` は使わない部品まで最初の JS に入る）。

## データと API
- Firestore のクエリは Rules に合わせる（`.claude/rules/data.md`）。posts の購読は `usePosts` に1本化している。
- 本番の Firestore は読んだ内容を端末（IndexedDB）に残す（`persistentLocalCache`。Issue #251。エミュレーターはメモリのまま）。サインアウトさせるときは `signOut` ではなく `clearDeviceData(行き先)`（`lib/firebase.ts`）を使う（端末の保存を消し、ページを読み直す。terminate した db は使えないため router では移らない）。
- API は `src/lib/api-client.ts` の `getJson` / `postJson` / `putJson` で呼ぶ（`res.json()` を直接呼ばない。5xx には問い合わせ用の ID が付く）。素の `fetch` は例外だけ: ログイン前の `/api/auth/line`、待たない顔検出、AI のストリーム（`src/lib/ai-stream.ts`）と音声（`src/lib/tts.ts`）。
- ブラウザに秘密を置かない。`NEXT_PUBLIC_*` は誰でも読める前提で扱う。パスコードや招待コードをクライアントのコードに書かない。

## 見た目と操作
- 文言は日本語の丁寧語。日時は `ja-JP`（管理画面は `Asia/Tokyo`）。
- 基調は `stone`（テーマは「紙と墨」。Issue #236）: 背景は紙 `bg-stone-50`（#f9f8f6）、罫線 `border-stone-200`（#ebe6df）、主ボタン `rounded-full bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-40`。ゲストブック・ご案内は**カードにしない**（白地・枠・角丸・影で区切らず、罫線と余白で区切る。一覧は親の `px-4` の外まで罫線を伸ばす `-mx-4 border-b border-stone-200 px-4`）。白い面のままにするのは、入力欄・ボトムシート・メニューなど「別の面」であること自体に意味がある所だけ。エラー rose、警告 amber、成功 emerald、情報 sky。`/screen` だけダーク。
- 色はテーマに従う（`src/config/theme.ts`。Issue #129）: `stone-*` はテーマの base に結び付いている。ブランドの差し色は `rose-*` ではなく `accent-*`（2色目 `sub-*`、3色目 `pop-*`）で書く。状態の色（エラー・危険 rose、警告 amber、成功 emerald、情報 sky）とタグの色（`tagstone-*` を含む）はテーマに従わせない。色の値を直接（`bg-[#…]`）書かない。**テラコッタ（`sub-*`）は押す場所（＋・投稿の帯・投稿画面の「投稿する」）だけ**、`accent-*`（赤）はいいねだけ。ゲスト側のタグは無彩色（`TagBadge` の既定。枠は `ring-tagline`）で、色分けは管理画面だけ（`colored`）。
- 文字の大きさ（Issue #240・#243）: `<html data-text-scale="large">` でゲストの画面ぜんぶの文字が約 1.12 倍になる（`globals.css` の `--inv-scale`・`--inv-tap` の1か所）。付け外しは `hooks/useTextScale.ts` で、`(guest)/layout.tsx`（本人の設定 `guestPrivate.textScale`、無ければ親族用から入った人は大きく）と親族用の招待状（`InvitationEntry`）だけが使う。管理画面・`/screen` では外れる。文字は `text-xs`〜`text-3xl` か `text-[length:calc(13px*var(--inv-scale))]`、押せる部品の高さは `min-h-[var(--inv-tap)]` で書く（px を直接書くと倍率が効かない）。正方形のアイコンボタン（`h-11 w-11`）はそのまま。html の font-size は変えない・zoom は使わない。`.inv-family`／`.inv-scaled` は、その中だけを大きくしたいとき（招待状テストの親族用・Portal のオープニング）に使う。
- スマホ前提: タップ領域 44px 以上（`touch-manipulation`）、高さは `dvh`、LINE アプリ内ブラウザ向けに `env(safe-area-inset-*)`。
- アクセシビリティ: アイコンボタンに `aria-label`、トグルに `aria-pressed`、タブは `role="tablist"` / `"tab"`、エラーは `role="alert"`。
- アニメーションは framer-motion（`components/screen/*` だけ。transform のみ）。
- 画像は `next/image`（unoptimized）。`<img>` を使うときは理由をコメントに書き、eslint-disable を付ける。URL は `src/lib/media-url.ts` 経由。
- 古い Safari のため、正規表現の後読みを使わない。文字数は `countChars`（書記素単位）で数える。
- コンポーネントは `components/{guestbook,guide,admin,screen}/` に PascalCase、フックは `hooks/useX.ts`、ライブラリは kebab-case。
