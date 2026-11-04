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
| `posts/{id}/reactions/{uid}` | 本人の分だけ（管理者は1件ずつ読める）。自分のいいねの一覧は `collectionGroup("reactions")` を `uid == 自分` と `limit(500)` 以下で絞ったときだけ（管理者も同じ。Issue #212） | 本人の1件だけ（その投稿が読める人）。`uid`（自分の uid）は必須 |
| `notifications/{uid}/items/{id}` | 本人 | 作成はサーバー（`/api/notifications/mention`）。本人の更新は `read` を `true` にするだけ |
| `faces` | 管理者 | サーバー |
| `episodes` | 管理者、または `approved` かつ `canSee` | サーバー |
| `tags` | サインイン済み | サーバー |
| `config/runtime`・`rateLimits`・`auditLogs`・`redeemAttempts`・`deletedMedia` | なし | サーバー |

- `reactionTimes/{uid}`（オープニングのリアクションタイム。Issue #131）と `config/invitation`・`config/invitation_family`（新郎新婦の名前・会場。親族用は Issue #240）は Rules に書かない = クライアントからは管理者も読み書きできない。読み書きはサーバーの `/api/guest/reaction`・`/api/guest/invitation` だけ。`reactionTimes` は最初の 1 回だけ作り、上書きしない。名前を入れない。ランキング（`/api/guest/reaction/ranking?tag=`）は、呼び出した人が Custom Claims でそのタグを持つときだけ返す（承認前は 403）。返すのは順位・ニックネーム・アイコン・タイムだけで、uid・本名・LINE の情報は返さない。「全員」（`all`）のときは本人以外のニックネーム・アイコンを空にする（Issue #174）。
- 仲間（`/api/guest/community/members?tag=`。Issue #174）も同じ条件（自分が持つタグだけ・承認前は 403）。`guestPrivate.attendance`・`familyAttendance` をサーバーで読んで欠席の人を除き、返すのはニックネーム・アイコン・`secondOnly` だけ（出欠の値・本名・uid・アレルギーは返さない）。「全員」は `count` だけ。回答フォームの注意書き（`COMMUNITY_ATTENDANCE_NOTICE`）を外さない。
- 上にないパスはすべて拒否。コレクションやフィールドを足すときは、先に「誰が読めるか」を決めて Rules を書く。
- 個人情報は `guestPrivate`（本人も見てよいもの）か `guestAdmin`（管理者だけ）へ。`guests` に足してよいのは公開して困らない値だけ。ゲスト向けの表示名は `src/lib/names.ts` の `publicName`（本名は出さない）。
- 投稿の非表示は `/api/admin/posts/visibility` だけで行う（`status: "hidden"` を直接書かない）。コメントも `visibleToTags: []`・`hidden: true` にして、横断購読（`/screen`）から外す。戻すときは親の `visibleToTags` を写し直す。
- 親族用の招待状（`/invitation/family`。Issue #240）から答えた人は `guestPrivate.invitationKind: "family"`（未設定は友人用）。記録は最初の回答のときだけ（register）で、あとから変えない。親族用の出欠は `familyAttendance`（`both` / `meal_only` / `ceremony_only` / `declined`）と `stayPrevNight`。**`attendance` は友人用だけ**（親族用の人は `unanswered` のまま。会費の計算は `attendance` だけを見る）。欠席の判定（仲間・顔の名寄せなど）は両方を見る。承認のとき `family` タグを自動で付ける（update-guest）。親族は会費を手渡しでいただくので、会費の API（`/api/guest/payment`）は 403「親族の方は会費の対象外です」を返し、画面は「会費」タブを出さない（Issue #243）。
- 文字の大きさの設定は `guestPrivate.textScale`（`large` / `normal`。未設定なら親族用は大きく）。書くのは `/api/guest/preferences` だけ（Issue #243）。
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
- `limit()` の上限: posts 50 / comments 100 / 自分のいいねの一覧（reactions の collection group）500 / notifications の items 50 / guests 200（管理者 500）/ guestPrivate・guestAdmin 500 / faces 300 / tags 200 / episodes 50（管理者 500）。
- posts は `status == "visible"` と `visibleToTags array-contains-any <自分のタグ>`（最大 30 個）を付ける。管理者（新郎新婦）の一覧だけはタグの条件を付けず、全投稿を出す（`usePosts`。インデックス `posts_timeline_admin`）。
- 「新郎新婦あて」の投稿は `visibleToTags: ["couple"]` だけ（ほかのタグと混ぜない。Rules が拒否する）。誰でも作れ、見えるのは投稿者本人と新郎新婦だけ。投稿者のタイムラインには出さず、マイページ（`useMyPosts`）にだけ出す。`/screen` は `SCREEN_TAGS`（既定 `all`）だけを出す。
- コメントの横断購読（`collectionGroup("comments")`）は `match /{path=**}/comments/{id}` のルールが別に要る。

## 書き込み
- `createPost` のフィールドは `validPost()` の `hasAll` / `hasOnly` と一致させる（片方だけ変えると全投稿が失敗する）。`createdAt` は `serverTimestamp()`。
- `mentionUids`（@メンションの相手の uid、最大 10）は posts / comments の任意のキー。相手がいるときだけ付け、通知は `/api/notifications/mention` が作る（クライアントから `notifications` へ書かない）。
- `media` 配列の更新はトランザクションで行う（同時に終わると書き負ける）。原本の状態を `published` / `skipped` から戻さない。
- 本人による投稿の編集（本文・写真）と削除は `/api/posts/[id]`（PATCH / DELETE）だけで行う。クライアントから `posts` の本文を書き換えたり `deleteDoc` したりしない（削除はコメント・いいね・faces をまとめて消し、公開バケットの写真と Rekognition の顔も消す。非公開バケットの原本とマーカーは消さない。Issue #122）。編集した投稿には `editedAt` が付く（「編集済」の判定に `updatedAt` を使わない）。
- カウンタ（`reactionCount` / `commentCount`）は `increment(±1)` と `updatedAt` だけを更新する。

## インデックスと TTL
- 複合インデックスは Terraform の `google_firestore_index` で管理する（`firestore_rules.tf`・`faces.tf`・`episodes.tf`・`screen.tf`。単一フィールドの collection group のインデックスは `google_firestore_field`。`reactions.tf`）。新しいクエリの形には index を足し、PR に「terraform apply が必要」と書く。
- `infra/firestore/firestore.indexes.json` の posts(authorUid, createdAt) だけは Terraform 管理外（webhook が使う）。
- TTL は `rateLimits.expiresAt` と `auditLogs.expiresAt`（Timestamp 型でなければ消えない）。監査ログ（`auditLogs`）は `create()` だけで、更新・削除しない。終了の記録に件数（`counts`。数だけ）を添えたいルートは、応答ヘッダ `x-audit-counts`（`config/audit.ts`）に JSON で入れる。`withGuard` が読んで外す。
- `deletedMedia`（投稿の削除で消した高画質版の印。Issue #122）は消さない・TTL を付けない（端末に残った原本が、何日もあとに送られて公開されうる）。

## タグ
- 組み込みタグは `src/config/tags.ts`（`all` / `guest` / `couple` / `family` / `friends_groom` / `friends_bride` / `colleagues` / `ceremony` / `after_party` など）。承認時に `all` と `guest` が付く。
- カスタムタグは `tags` コレクション（ID は `c_` + 8 桁の16進数、物理削除せず `archived`）。作るのはタグの管理（`/admin/tags`）の「＋ 新しいタグ」か `TagPicker` の「＋ 新しいタグを作成…」（どちらも `/api/admin/tags` の POST。並び順の最後に入る）、名前・色・コミュニティ・並び順・アーカイブを直すのはタグの管理（Issue #221。書き込みは `/api/admin/tags` の PATCH だけ）。
- **組み込みのタグも `tags/{組み込みの ID}` に上書き用のドキュメントを置ける**（Issue #248）: `label`・`palette`・`community`・`archived`（隠す）・`order`。無ければ `TAG_DEFS` のまま。辞書（`config/tags.ts` の `applyTagDocs`。クライアントは `lib/tags-client.ts` の購読、サーバーは `lib/tags-server.ts` の `loadTagDictionary`）で重ねる。**隠せないタグは `all`・`guest`・`couple`・`family`**（`LOCKED_TAG_IDS`。API も `archived: true` を断る）、`guest` は名前・色も変えない。ID は変えない・物理削除しない。隠したタグはアーカイブと同じ扱い（選択肢・コミュニティ・承認後の写真の一覧に出さず、付いている人の表示と権限は残る。名簿の一括追加でも付けない）。
- **タグの並び順は1つ**（Issue #248）: 組み込みと作ったタグを1つの並び（`order`）にし、この順が承認後の写真の優先順も兼ねる（`pickWelcome(config, tags, tagOrder)`。上ほど優先、`all`・`guest` は最後）。`config/welcome` の `priority`（Issue #215）は読み込みで無視し、保存では書かない。移行は `migrateTagOrder`（並び順が未保存なら、priority の順を先にして全タグに order を振る。/admin/tags・/admin/welcome を開いたときと、承認後の写真の保存の前に呼ぶ。移す前は、ゲストの写真は priority を先に使う）。Composer はまだ組み込みタグ前提。`visibility.ts`・EpisodeModal は組み込みのタグの上書きを見る（作ったタグはまだ見ない）。
- Tailwind のクラス文字列は Firestore に保存しない（パレットのキーだけを保存し、クラスは `TAG_PALETTES` から引く）。
