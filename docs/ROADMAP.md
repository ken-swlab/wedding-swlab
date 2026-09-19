# 結婚式用プライベートSNS 兼 CTFプラットフォーム — ROADMAP

Next.js (App Router) on Vercel / Firebase (Auth・Firestore) / Terraform (GCP)

---

## 設計の背骨

すべての可視性は **タグベースの ABAC** に集約している。

- タグの実体は Firebase の **Custom Claims** (`request.auth.token.tags`)
- 投稿・コメント・CTF問題は `visibleToTags[]` を持つ
- 両者が1つでも交差すれば可視

タグを Firestore ではなく Claims に置いているのは、タイムラインのクエリが
Security Rules によって **1ドキュメントずつ評価される**ため。`get()` で
タグを引くと読み取り上限（クエリ時20回）に即座に到達する。

### 守っている不変条件

| 不変条件 | 実装箇所 |
|---|---|
| Rules はフィルタではない。クライアントのクエリに `array-contains-any` が必須 | `hooks/usePosts.ts` |
| `setCustomUserClaims` は全置換。必ず既存クレームとマージする | `api/*/route.ts` |
| `admin` クレームは API では変更しない。昇格は CLI のみ | `scripts/make-admin.mjs` |
| 匿名ユーザーに `revokeRefreshTokens()` を使わない（UID が復元不能） | `claimsUpdatedAt` 方式 |
| 健康情報（アレルギー）は公開プロフィールに置かない | `/guestPrivate/{uid}` |
| CTF のフラグは Firestore に置かない | Secret Manager + Route Handler |
| 原本のアップロードキューは Composer の外に置く（投稿でリセットされるため） | `app/guestbook/page.tsx` |
| `collectionGroup` にはネストした match のルールが効かない。`match /{path=**}/comments/{id}` が別途必要 | `firestore.rules` |
| 投影対象は `all` タグのみ。限定公開の投稿を大画面に出さない | `config/screen.ts` |
| `media` 配列への追記はトランザクション必須（同時完了で書き負ける） | `lib/media.ts` |

---

## データモデル

| コレクション | 読める人 | 内容 |
|---|---|---|
| `/guests/{uid}` | サインイン済み全員 | 表示名・ニックネーム・アイコン・タグ・承認状態 |
| `/guestPrivate/{uid}` | 本人と管理者 | 出欠・アレルギー・送金ステータス |
| `/guestAdmin/{uid}` | 管理者のみ | LINE User ID・運営メモ・ログイン履歴 |
| `/posts/{id}` | `visibleToTags` が交差する人 | 本文・メディア・ハッシュタグ・メンション |
| `/posts/{id}/comments/{id}` | 同上（親からコピー） | 280文字・ハッシュタグ・メンション |
| `/posts/{id}/reactions/{uid}` | サインイン済み全員 | 1人1件（docId = uid） |
| `/challenges/{id}` | `visibleToTags` が交差する人 | CTF の問題メタ（フラグは含まない） |
| `/solves/{id}` | 本人と管理者 | 解答記録（書き込みはサーバーのみ） |
| Storage `uploads/{uid}/thumb/` | 承認済みゲスト | 軽量版（最大1920px / 品質0.8） |
| Storage `uploads/{uid}/original/` | 承認済みゲスト | 原本（裏で非同期に送信・投影に使用） |

---

## 実装済み

- **Phase 1** ウォーキング・スケルトン（Next.js + Terraform）
- **Phase 2** Firebase / Firestore の実体作成、Vercel への環境変数連携
- **Phase 3** ABAC のデータモデルと Security Rules、ゲストブック UI、リアルタイム購読
- **Phase 4** 招待コードによるタグ配布（**Phase 5.5 で廃止・既定で 410**）
- **Phase 4.5** 運営ダッシュボード（Excel 風インライン編集・CSV 出力）
- **Phase 5** コメント機能（280文字・ハッシュタグ・メンション）
- **Phase 5**（認証）LIFF による LINE ログイン + Custom Token
- **Phase 5.5** Web招待状フロー（登録 → 承認 → 解放）、送金ステータス管理
- **Phase 7** 写真の二段階アップロード、タグ別公開範囲 UI、Storage Security Rules
- **Phase 7.5** プロジェクター投影ビュー `/screen`（写真の飛び込み演出 + コメント流し）

---

## 次にやること

### Phase 6 — 送金フローの完成
- [ ] ゲスト側の「送金しました」報告 UI（`paymentStatus: none → remitted`）
- [ ] タグ別の送金先出し分け（親族は不要、友人のみ表示 など）
- [ ] 送金リンク（PayPay / 銀行振込）のタグ別表示
- [ ] 受領確認の通知を LINE Messaging API で自動送信

### Phase 7.5 — 当日の写真運用（残タスク）
- [ ] 専属カメラマンの写真をニアリアルタイムで取り込む経路（PC からの一括投入）
- [ ] 会場内にいるうちに送信を完結させる導線（LINE 通知でのリマインド）
- [ ] 原本の EXIF / GPS 削除（現在は軽量版のみ再エンコードで落ちている）
- [ ] 1投稿あたりの上限4枚の引き上げ（Rules の `validPost` と MediaGrid の両方に手当てが必要）
- [ ] 原本アップロードの中断復帰（現在はページを閉じると失われる）

### Phase 7.6 — 投影の作り込み（当日までに効くもの）
- [ ] 動画の投影対応（現在は静止画のみ。自動再生と音声の扱いを決める必要あり）
- [ ] 運営が投稿を投影から外す導線（`status: hidden` への切り替えボタン）
- [ ] カメラマンの写真を PC から一括投入する経路（`/admin` からのアップロード）
- [ ] 演出の切り替え（歓談中はゆっくり、余興中はコメント多めなど）
- [ ] オフライン時のフォールバック（会場 Wi-Fi 断でも直前の写真を出し続ける）

### Phase 8 — CTF 機能
- [ ] `/challenges` への問題投入スクリプト（Admin SDK）
- [ ] 採点 Route Handler（フラグは Secret Manager、ハッシュ比較）
- [ ] 正解時に `ctf_stageN` タグを付与 → タイムラインに隠し投稿が出現
- [ ] スコアボード（`/solves` の集計）
- [ ] 総当たり対策のレート制限（`/redeemAttempts` と同じ Firestore 方式）

### 運用上の微修正
- [ ] **出欠ステータスの選択肢を細分化する**
      現在は「出席 / 欠席 / 未回答」の3値だが、実運用では
      「1次会のみ / 1次会＋2次会 / 2次会のみ / 欠席」に分けたい。
      影響範囲: `types/admin.ts` の `ATTENDANCE_OPTIONS`、
      `api/guest/register` と `api/admin/update-guest` の検証、
      `OnboardingForm` の選択 UI、`GuestTable` の集計と色分け。
      既存データは `attending` を「1次会＋2次会」に寄せる移行が必要。
- [ ] ニックネーム重複時の表示（同姓同名のゲスト対策）
- [ ] 招待コード方式（`ENABLE_INVITE_CODES`）の完全削除判断

### Phase 9 — 運用の堅牢化
- [ ] Terraform の state を GCS バックエンドへ移行（現在ローカル）
- [ ] `reactionCount` / `commentCount` を Cloud Functions で厳密化
- [ ] `/admin` を middleware で保護（現在はクライアント判定のみ）
- [ ] メンションの実ユーザー解決（`/guests` に一意な `handle` を追加）
- [ ] ハッシュタグ検索ページ
- [ ] 当日のフェイルセーフ（Firestore 障害時の静的フォールバック画面）

---

## 運用メモ

- 管理者化: `cd app/web && node scripts/make-admin.mjs --list` → `node scripts/make-admin.mjs <uid>`
- タグを増やすときは `src/config/tags.ts` の `TAG_DEFS` に1行足すだけでよい
  （API 側の検証も同じ辞書を参照しているため、タイポによる事故が起きない）
- `NEXT_PUBLIC_*` はビルド時に埋め込まれるため、Vercel で値を変えたら Redeploy が必要
- Firestore のロケーションは変更不可（`asia-northeast1`）
