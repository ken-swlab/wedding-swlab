---
paths:
  - "infra/firestore/**"
  - "infra/terraform/{firestore_rules,faces,episodes,screen,audit}.tf"
  - "app/web/src/hooks/**"
  - "app/web/src/lib/{posts,comments,media,tags-client,visibility,names}.ts"
  - "app/web/src/types/**"
  - "app/web/src/config/{tags,screen}.ts"
  - "app/web/src/app/api/**"
---

# Firestore とアクセス制御

## コレクションと Rules（infra/firestore/firestore.rules）
| コレクション | 読める人 | 書ける人 |
|---|---|---|
| `guests/{uid}` | 本人・管理者・タグを1つ以上持つ人 | サーバー（本人のプロフィールは `/api/guest/profile` 経由。本人の直接の書き込みは不可） |
| `guestPrivate/{uid}` | 本人・管理者 | サーバー |
| `guestAdmin/{uid}` | 管理者 | サーバー |
| `posts/{id}` | `canSee`（管理者、または `visibleToTags` と自分の `tags` が重なる）。投稿者本人は常に読める | 作成は本人（`validPost()` かつ、自分のタグの範囲か `['couple']` ちょうど）。本人の直接の更新は `media`・`updatedAt` だけ（本文の編集は `/api/posts/[id]`）。カウンタは ±1（`reactionCount` は自分のいいねの作成・削除と同じ書き込みのときだけ） |
| `posts/{id}/comments` | 親の `canSee`（横断購読と get はコメント自身の `visibleToTags`。書いた本人は常に読める） | 本人が作成（表示中の投稿だけ。`visibleToTags` は親と完全一致）。更新不可 |
| `posts/{id}/reactions/{uid}` | 本人の1件だけ（管理者は読める） | 本人の1件だけ（その投稿が読める人） |
| `notifications/{uid}/items/{id}` | 本人 | 作成はサーバー（`/api/notifications/mention`）。本人の更新は `read` を `true` にするだけ |
| `faces` | 管理者 | サーバー |
| `episodes` | 管理者、または `approved` かつ `canSee` | サーバー |
| `tags` | サインイン済み | サーバー |
| `config/runtime`・`rateLimits`・`auditLogs`・`redeemAttempts` | なし | サーバー |

- 上にないパスはすべて拒否。コレクションやフィールドを足すときは、先に「誰が読めるか」を決めて Rules を書く。
- 個人情報は `guestPrivate`（本人も見てよいもの）か `guestAdmin`（管理者だけ）へ。`guests` に足してよいのは公開して困らない値だけ。ゲスト向けの表示名は `src/lib/names.ts` の `publicName`（本名は出さない）。
- 投稿の非表示は `/api/admin/posts/visibility` だけで行う（`status: "hidden"` を直接書かない）。コメントも `visibleToTags: []`・`hidden: true` にして、横断購読（`/screen`）から外す。戻すときは親の `visibleToTags` を写し直す。
- アクセス停止は `guestPrivate.isActive === false`。判定は `!== false`（未設定を停止扱いにしない）。

## Rules のテスト（infra/firestore/test。Issue #101）
- 実行は `cd infra/firestore/test && npm test`（初回は `npm ci`。Java 21）。Firestore エミュレーター（プロジェクト `demo-wedding-rules`）の上で、`firestore.rules` をそのまま読み込んで動く。本番にはつながない。
- **Rules を変えたら、必ずテストを通す。Rules を変える PR には、対応するケースを一緒に足す**（許可されるものと拒否されるものの両方。権限を閉じる修正なら、再発防止のケースも）。
- ケースは `rules.test.mjs` の表に1行ずつ書く: `[人物, ALLOW | DENY, 説明, 操作]`。人物（未ログイン・未承認・ゲスト・挙式参列者・新郎友人・新婦友人・新郎新婦・管理者・停止ゲスト）と初期データは `harness.mjs`。
- 「現状:」で始まるケースは、今の Rules の動きを固定しただけのもの。Rules を直すときは期待結果も一緒に変える。
- 落ちたときは、エミュレーターのメッセージに拒否した Rules の行番号（`L123`）が出る。
- コレクションや `match` を足したら、テストにも足す（既定拒否のテストは、Rules に書かれていないパスだけを見ている）。
- CI は `.github/workflows/rules-test.yml`（`infra/firestore/**`・`firebase.json` を変える PR）。Rules の反映は `terraform apply` なので、赤いまま apply しない。

## クライアントのクエリ
- Rules はフィルタではない。条件と `limit()` が Rules と合わないクエリは全体が拒否される。
- `limit()` の上限: posts 50 / comments 100 / notifications の items 50 / guests 200（管理者 500）/ guestPrivate・guestAdmin 500 / faces 300 / tags 200 / episodes 50（管理者 500）。
- posts は `status == "visible"` と `visibleToTags array-contains-any <自分のタグ>`（最大 30 個）を付ける。管理者（新郎新婦）の一覧だけはタグの条件を付けず、全投稿を出す（`usePosts`。インデックス `posts_timeline_admin`）。
- 「新郎新婦あて」の投稿は `visibleToTags: ["couple"]` だけ（ほかのタグと混ぜない。Rules が拒否する）。誰でも作れ、見えるのは投稿者本人と新郎新婦だけ。投稿者のタイムラインには出さず、マイページ（`useMyPosts`）にだけ出す。`/screen` は `SCREEN_TAGS`（既定 `all`）だけを出す。
- コメントの横断購読（`collectionGroup("comments")`）は `match /{path=**}/comments/{id}` のルールが別に要る。

## 書き込み
- `createPost` のフィールドは `validPost()` の `hasAll` / `hasOnly` と一致させる（片方だけ変えると全投稿が失敗する）。`createdAt` は `serverTimestamp()`。
- `mentionUids`（@メンションの相手の uid、最大 10）は posts / comments の任意のキー。相手がいるときだけ付け、通知は `/api/notifications/mention` が作る（クライアントから `notifications` へ書かない）。
- `media` 配列の更新はトランザクションで行う（同時に終わると書き負ける）。原本の状態を `published` / `skipped` から戻さない。
- 本人による投稿の編集（本文・写真）と削除は `/api/posts/[id]`（PATCH / DELETE）だけで行う。クライアントから `posts` の本文を書き換えたり `deleteDoc` したりしない（削除はコメント・いいね・faces をまとめて消す。R2 のオブジェクトは消さない）。編集した投稿には `editedAt` が付く（「編集済」の判定に `updatedAt` を使わない）。
- カウンタ（`reactionCount` / `commentCount`）は `increment(±1)` と `updatedAt` だけを更新する。

## インデックスと TTL
- 複合インデックスは Terraform の `google_firestore_index` で管理する（`firestore_rules.tf`・`faces.tf`・`episodes.tf`・`screen.tf`）。新しいクエリの形には index を足し、PR に「terraform apply が必要」と書く。
- `infra/firestore/firestore.indexes.json` の posts(authorUid, createdAt) だけは Terraform 管理外（webhook が使う）。
- TTL は `rateLimits.expiresAt` と `auditLogs.expiresAt`（Timestamp 型でなければ消えない）。監査ログ（`auditLogs`）は `create()` だけで、更新・削除しない。

## タグ
- 組み込みタグは `src/config/tags.ts`（`all` / `guest` / `couple` / `family` / `friends_groom` / `friends_bride` / `colleagues` / `ceremony` / `after_party` など）。承認時に `all` と `guest` が付く。
- カスタムタグは `tags` コレクション（ID は `c_` + 8 桁の16進数、物理削除せず `archived`）。Composer・EpisodeModal・`visibility.ts` はまだ組み込みタグ前提。
- Tailwind のクラス文字列は Firestore に保存しない（パレットのキーだけを保存し、クラスは `TAG_PALETTES` から引く）。
