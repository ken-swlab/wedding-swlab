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
| `posts/{id}` | `canSee`（管理者、または `visibleToTags` と自分の `tags` が重なる） | 作成は本人（`validPost()` かつ自分のタグの範囲）。本人の更新は `text`・`media`・`visibleToTags`・`hashtags`・`mentions`・`updatedAt` だけ。カウンタは ±1 |
| `posts/{id}/comments` | 親の `canSee` | 本人が作成（`visibleToTags` は親と完全一致）。更新不可 |
| `posts/{id}/reactions/{uid}` | サインイン済み | 本人の1件だけ |
| `faces` | 管理者 | サーバー |
| `episodes` | 管理者、または `approved` かつ `canSee` | サーバー |
| `tags` | サインイン済み | サーバー |
| `config/runtime`・`rateLimits`・`auditLogs`・`redeemAttempts` | なし | サーバー |

- 上にないパスはすべて拒否。コレクションやフィールドを足すときは、先に「誰が読めるか」を決めて Rules を書く。
- 個人情報は `guestPrivate`（本人も見てよいもの）か `guestAdmin`（管理者だけ）へ。`guests` に足してよいのは公開して困らない値だけ。ゲスト向けの表示名は `src/lib/names.ts` の `publicName`（本名は出さない）。
- アクセス停止は `guestPrivate.isActive === false`。判定は `!== false`（未設定を停止扱いにしない）。

## クライアントのクエリ
- Rules はフィルタではない。条件と `limit()` が Rules と合わないクエリは全体が拒否される。
- `limit()` の上限: posts 50 / comments 100 / guests 200（管理者 500）/ guestPrivate・guestAdmin 500 / faces 300 / tags 200 / episodes 50（管理者 500）。
- posts は `status == "visible"` と `visibleToTags array-contains-any <自分のタグ>`（最大 30 個）を付ける。`/screen` は `SCREEN_TAGS`（既定 `all`）だけを出す。
- コメントの横断購読（`collectionGroup("comments")`）は `match /{path=**}/comments/{id}` のルールが別に要る。

## 書き込み
- `createPost` のフィールドは `validPost()` の `hasAll` / `hasOnly` と一致させる（片方だけ変えると全投稿が失敗する）。`createdAt` は `serverTimestamp()`。
- `media` 配列の更新はトランザクションで行う（同時に終わると書き負ける）。原本の状態を `published` / `skipped` から戻さない。
- カウンタ（`reactionCount` / `commentCount`）は `increment(±1)` と `updatedAt` だけを更新する。

## インデックスと TTL
- 複合インデックスは Terraform の `google_firestore_index` で管理する（`firestore_rules.tf`・`faces.tf`・`episodes.tf`・`screen.tf`）。新しいクエリの形には index を足し、PR に「terraform apply が必要」と書く。
- `infra/firestore/firestore.indexes.json` の posts(authorUid, createdAt) だけは Terraform 管理外（webhook が使う）。
- TTL は `rateLimits.expiresAt` と `auditLogs.expiresAt`（Timestamp 型でなければ消えない）。監査ログ（`auditLogs`）は `create()` だけで、更新・削除しない。

## タグ
- 組み込みタグは `src/config/tags.ts`（`all` / `guest` / `couple` / `family` / `friends_groom` / `friends_bride` / `colleagues` / `ceremony` / `after_party` など）。承認時に `all` と `guest` が付く。
- カスタムタグは `tags` コレクション（ID は `c_` + 8 桁の16進数、物理削除せず `archived`）。Composer・EpisodeModal・`visibility.ts` はまだ組み込みタグ前提。
- Tailwind のクラス文字列は Firestore に保存しない（パレットのキーだけを保存し、クラスは `TAG_PALETTES` から引く）。
