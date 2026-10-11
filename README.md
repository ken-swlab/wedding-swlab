# wedding-swlab

2027-05-29 の披露宴のための、招待制プライベート SNS 兼ゲスト管理システム。構成とルールは [CLAUDE.md](CLAUDE.md)。

## 開発手順

```bash
cd app/web && npm ci
npm run dev:emulator            # Firebase エミュレーター + 初期データ + next dev（/dev-login から入る。Java 21 が要る）
npx tsc --noEmit && npm run lint && npm run build
```

### Firestore の Rules のテスト

```bash
cd infra/firestore/test && npm ci   # 初回だけ
npm test                            # Firestore エミュレーターの上で動く。本番にはつながない
```

Rules（`infra/firestore/firestore.rules`）を変えたら、`rules.test.mjs` の表にケース（許可と拒否の両方）を足して、通してから PR にする。`dev:emulator` と同じポートを使うので、同時には動かせない。

### 秘密の混入の検査（gitleaks）

CI（`.github/workflows/security.yml`）が、PR の差分と、毎週月曜に履歴全体を検査する。手元でも同じ検査ができる（[gitleaks](https://github.com/gitleaks/gitleaks/releases) 8.30.1）。

```bash
gitleaks git --redact                                # 履歴全体（値は伏せて表示される）
gitleaks git --redact --log-opts="origin/main..HEAD" # いまのブランチで足したコミットだけ
```

- 検出されたものが本物の秘密なら、先に失効・再発行する（コミットを消しても、漏れた値は取り消せない）。
- 誤検知は、理由を書いて `.gitleaks.toml` の許可リストに足す。

### 依存の脆弱性の検査

```bash
node app/web/scripts/check-audit.mjs app/web                       # 本番に入る依存の high 以上で失敗する
node app/web/scripts/check-audit.mjs infra/workers/exif-stripper
```

- 直すときは Dependabot の PR をマージするか、対象のパッケージだけを上げる。まとめて自動で上げるコマンドは、メジャー更新が入って API が壊れた前例があるので使わない（`.github/dependabot.yml` の注意）。
- 直せない・影響しないと判断したものは、理由と期限（最長 90 日）を書いて `.github/audit-ignore.json` に足す。
