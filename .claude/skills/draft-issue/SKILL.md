---
name: draft-issue
description: "機能の相談を受けて、コードと決めごとを読み、提案してから Issue にする。実装はしない"
argument-hint: "[相談の内容]"
allowed-tools: Bash(gh issue list *) Bash(gh issue view *) Bash(gh issue create *) Bash(git status *) Bash(git log *) Bash(git diff *)
---

# 機能の相談から Issue を作る

相談の内容: $ARGUMENTS（空なら依頼文から読み取る。分からなければ聞く）

**このスキルではコードを変更しない。** 読む・提案する・Issue を書く、までで止まる。実装は `implement-issue` の仕事。

## 1. 読む
- `docs/product-decisions.md` と `CLAUDE.md` を**必ず**読む（省略しない）。
- 相談に関係するコードを grep して読む（画面・API・Firestore の Rules・`src/config/*`・関係する `.claude/rules/`）。
- 似た Issue がないか `gh issue list --search "<キーワード>" --state all` で探す（`gh` が使えなければ飛ばす）。

## 2. まず提案だけ返す
Issue はまだ作らない。次の形で返して、オーナーの返事を待つ。

- **今の実装の動き**: いまどう動いているか。根拠のファイル名（`path:行`）を付ける。
- **項目ごとのおすすめ案**: 相談の項目ごとに、おすすめを1つ選んで理由を添える（選択肢を並べるだけにしない）。
- **決めごととの食い違い**: 要望が `docs/product-decisions.md` や CLAUDE.md の絶対ルールと食い違うなら、どの決めごとかを示して指摘する。食い違いが無ければ書かなくてよい。
- **確認したいこと**: 最大3つ。答えで案が変わるものだけにする。

## 3. 「Issue にして」と言われたら書く
次の見出しで本文を書く。

```markdown
## 背景・目的

## 変更内容

## 対象外

## オーナー作業
（Terraform の apply・`scripts/ops.mjs`・Cloudflare・LINE・Vercel の環境変数などの手作業。無ければ「なし」）

## 受け入れ条件
- [ ] …
```

- 新しい決めごとが出たら、「変更内容」に「`docs/product-decisions.md` の更新」を含める。
- 受け入れ条件は確かめられる形で書く（画面で何が見えるか・何が拒否されるか）。
- `gh` で Issue を作れるなら `gh issue create --title "<タイトル>" --body-file <一時ファイル>` で作り、番号と URL を返す。一時ファイルはリポジトリの外（スクラッチパッドなど）に置く。
- 作れなければ、タイトルと本文をそれぞれコードブロックで出す。

## 書かないもの
- 本名・新郎新婦の名前・日付・会場・住所・支払い情報・パスコード・鍵やトークンの値は、提案にも Issue にも書かない（リポジトリと Issue は公開）。例が要るときは架空の値を使う。
- ゲストの個人情報・事故の詳細・相手の会社名や連絡先も書かない。
