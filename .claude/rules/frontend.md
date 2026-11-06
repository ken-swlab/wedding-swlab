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
- `useGuestSession`: claims の `tags` / `admin` と、`guests/{uid}`・`guestPrivate/{uid}` の `isActive`・`invitationKind`（Issue #240）・`textScale`（Issue #243）・`photoIntroSeen`（Issue #272）・`closeHintSeen`（Issue #273）を購読する。`claimsUpdatedAt` が増えたらトークンを取り直す（承認やタグ変更がこれで画面に届く）。Context ではないので、呼ぶたびに購読が増える点に注意。
- 管理者かどうかは `claims.admin === true` だけで決める。
- 起動（Issue #250）: ゲストの画面は Firebase のログイン（端末に残ったもの）だけを見て出し、LINE の確認（`liff.init`）は待たない。LINE アプリの中では、最初の画面のあとに `useLineAccountCheck` が LINE のアカウントと uid を比べ、違えばサインアウトして招待状からログインし直させる。`useGuestSession` は前回のプロフィール（guests の公開して困らない値だけ）を端末に覚え、届くまではそれで行き先を決める（届いた値で上書きする）。
- 起動の速さ（Issue #277）: 関数は東京（`app/web/vercel.json` の `regions: ["hnd1"]`。Firestore と同じ地域。Hobby は1か所まで）。起動の段階（`js`・`liff-init`・`auth-line`・`firebase-login`・`first-content`）を `lib/boot-timing.ts` の `bootMark`／`useBootMark` で記録し、Sentry に「app.boot」として1回だけ送る（10% の抽出のまま。値はミリ秒だけ）。ブラウザの Sentry の初期化は最初の画面のあと（`requestIdleCallback`、遅くとも `SENTRY_INIT_TIMEOUT_MS`）で、それまでのエラーは控えてから送る（`instrumentation-client.ts`）。LINE の SDK は、Firebase のログインが無いと分かってから入口で前もって読み込み・準備する（`useLiffAuth` の `loadLiff`。ログイン済みの人には読まない）。API の中は順番に待たず `Promise.all` で同時に読み、`lib/server-timing.ts` で `Server-Timing` ヘッダを返す（`/api/auth/line`・`/api/guest/invitation`）。
- 最初の画面に要らない部品は `next/dynamic` で使うときに読む（投稿画面・写真のビューア・投稿の詳細・写真の選択・承認後の演出・投稿の編集・画像の圧縮のライブラリ）。重い部品を足すときも同じにする。Sentry は名前を付けて import する（`import * as Sentry` は使わない部品まで最初の JS に入る）。

## データと API
- Firestore のクエリは Rules に合わせる（`.claude/rules/data.md`）。posts の購読は `usePosts` に1本化している。
- 本番の Firestore は読んだ内容を端末（IndexedDB）に残す（`persistentLocalCache`。Issue #251。エミュレーターはメモリのまま）。サインアウトさせるときは `signOut` ではなく `clearDeviceData(行き先)`（`lib/firebase.ts`）を使う（端末の保存を消し、ページを読み直す。terminate した db は使えないため router では移らない）。
- 投稿は送信を待たない（Issue #254）: 投稿画面（Composer）は「投稿する」で `PostDraft`（ID は `newPostId()` で先に決める）を送信の列 `usePostOutbox`（`ComposerSheetProvider` に1つ）に渡してすぐ閉じる。送信の処理は `lib/post-send.ts`（送るときに `import()`）、タイムラインは `PendingPostCard` を一番上に出し、同じ ID の本物は列から外れるまで出さない（本物の写真を読み込んでから入れ替える）。送れなければ「もう一度送る」「取り消す」と、`online` で自動の再送。**送信中の投稿は端末に保存しない**（閉じると消える。送っている間は閉じる前に確認を出す）。
- ギャラリーは `config/guestbook.ts` の `GALLERY_ENABLED`（いまは `false`。Issue #270）でゲストから隠す: 下のタブは4つ、`?view=gallery` はタイムラインに書き直し、ギャラリーの先読みもしない。管理者には出す（`useGalleryEnabled`）。`true` で元の形に戻る。
- 「戻る」の履歴（Issue #273。`hooks/useHistoryOverlay.ts`）: **タブの切り替え（下のタブ・ご案内のタブ・H&K の▾）は `replace`**（履歴に積まない）。タブの画面は `useHistoryFloor` で「床」の履歴を1つ下に置き、戻るで床に来たら `history.forward()` で戻す（招待状・ログインの画面へ戻らない）。**重なる画面（写真の全画面・投稿画面・公開範囲・説明のシート）は `useBackToClose`** で、開くときに同じ URL の履歴を1つ積み、戻るで閉じる（× で閉じたら積んだ履歴を戻す）。投稿の詳細は URL の履歴（`PostDetailSheet`）。投稿画面を戻るで閉じたときは、書きかけを残して隠す。写真の全画面のスワイプは、画面の左右 24px（`SWIPE_EDGE_GUARD_PX`）から始まった指を受け付けない。新しく重なる画面を作るときも `useBackToClose` を使う。
- 閉じても元の場所に戻る（Issue #273）: `(guest)/layout.tsx` が最後に見ていた画面（パスとスクロール位置）を localStorage に覚え（`lib/resume.ts`。画面を移るたびと `visibilitychange`・`pagehide`）、承認済みの人がこのページで最初にゲストブックのトップ（`/guestbook`。クエリなし）に入ってきたら、そこへ移す（24 時間以内だけ。スクロールは `useResumeScroll`）。投稿画面・コメントの書きかけは `lib/composer-draft.ts`（本文は localStorage、写真は IndexedDB の `wedding-drafts`。`wedding-uploads` とは別）。送信・捨てる・サインアウト（`clearDeviceData`）で消す。LINE の中だけ、承認後の演出のあとに一度「↓ を押すとすぐ戻れます」（`CloseHint`。閉じた印は `guestPrivate.closeHintSeen`）。
- 先読み（Issue #255。`lib/prefetch.ts`）: タイムラインは見えている投稿の次の 3 件の一覧の写真（feed）、ギャラリーは次の1画面分（grid）を `new Image()` で読む。全画面の写真は先読みしない。タイムラインが落ち着いたら（`whenIdle`）下のタブの画面を `router.prefetch` し、ギャラリーの最初の 30 枚分のデータと1画面分の写真を読む。**下のタブの `Link` は `prefetch={false}`**（最初の画面と取り合わないよう、ここでまとめて読む）。電波が悪い（`saveData`・`2g`）ときは写真を1件だけにし、画面の先読みはしない。
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
