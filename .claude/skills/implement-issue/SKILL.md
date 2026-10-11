---
name: implement-issue
description: "GitHub Issue の仕様どおりに実装し、検証してプルリクエストを作る。「Issue #12 を実装して」「#12 の通りに作って」のように Issue 番号で実装を頼まれたときに使う。"
argument-hint: "[Issue 番号]"
allowed-tools: Bash(gh issue view *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(npx tsc *) Bash(npm run lint *) Bash(npm run build *)
---

# Issue の実装

対象の Issue 番号: $ARGUMENTS（空なら依頼文から読み取る。分からなければ聞く）

## 1. 読む
- `gh issue view <番号> --comments` で本文とコメントを読む。`gh` が使えなければ、オーナーに本文の貼り付けを頼む。
- 関係するコードを読み、CLAUDE.md の「絶対ルール」と `.claude/rules/` に照らして、影響する範囲（API・Rules・インデックス・Worker・環境変数）を洗い出す。

## 2. 書く前に確認する（当てはまるときだけ）
次のどれかに当てはまったら、コードを書く前にオーナーに質問する。当てはまらなければ確認なしで進めてよい。
- 仕様が曖昧・矛盾している、または完了の条件が読み取れない
- 絶対ルールを破らないと実現できない（例: 本名を `guests` に出す、例外の本文を返す、`/_next/image` を戻す、CSP を緩める）
- Firestore Rules・Terraform・環境変数・外部サービスの設定変更、データの移行や削除が要る

## 3. ブランチ
- 作業ツリーに未コミットの変更があれば、触らずにオーナーに確認する。
```bash
git switch main && git pull --ff-only && git switch -c issue-<番号>-<短い英語>
```

## 4. 実装
- Issue の範囲だけを変える。ついでのリファクタはしない（気づいたことは PR に書く）。
- 近い既存コードの書き方に合わせる（新しい API は既存ルートを複製する）。定数は `src/config/*` に置く。
- `★` コメントの不変条件を守り、新しく作った不変条件には理由付きの `★` コメントを残す。
- Firestore のクエリや書き込みを変えたら、Rules（`validPost()` や `limit` の上限）と複合インデックスとの整合を確かめる。
- Rules を変えるときは、テスト（`infra/firestore/test/rules.test.mjs`）のケースも一緒に変える・足す。

## 5. 検証（すべて通るまで繰り返す）
```bash
cd app/web && npx tsc --noEmit
cd app/web && npm run lint
cd app/web && npm run build
```
- Firestore の Rules（`infra/firestore/**`）を変えたら `cd infra/firestore/test && npm test`（初回は `npm ci`）。Rules を変える PR には、対応するテストのケース（許可と拒否の両方）を必ず一緒に足す。
- Worker を触ったら `cd infra/workers/exif-stripper && npm run typecheck`。Terraform を触ったら `terraform fmt -check` と `terraform validate`（`apply` はしない）。
- 通らないまま完了にしない。直せないときは、エラーと原因の見立てをオーナーに報告して止まる。
- 画面を変えたら、スマホ（LINE アプリ内ブラウザ）での確認手順を PR に書く。

## 6. コミットとプルリクエスト
- `git add <変更したファイルを列挙>`（`git add .` / `-A` は使わない）。`git status` で `.env*`・鍵・`pii-backup-*.json` が入っていないことを確かめる。
- コミットメッセージは `type(scope): 日本語の要約`（feat / fix / chore / refactor / docs）。本文に `Closes #<番号>`。
- `git push -u origin HEAD` のあと `gh pr create --base main`。本文に書くこと:
  - 変更の要約と、変更したファイル
  - 検証したコマンドと結果
  - 確認手順（スマホ・管理画面）
  - オーナーの作業（`terraform apply`・環境変数・Worker のデプロイ・データ移行）。無ければ「なし」
  - 気づいた別の問題（Issue の候補）
- `main` への直接 push とマージはしない。オーナーが PR を見てマージする（マージ = 本番デプロイ）。

## 7. 報告
PR の URL、変更の要約、オーナーの作業の有無を短く伝える。
