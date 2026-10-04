---
paths:
  - "app/web/src/app/api/**"
  - "app/web/src/lib/route-guard.ts"
  - "app/web/src/lib/*-server.ts"
  - "app/web/src/lib/{audit,rate-limit,runtime-config,public-error,firebase-admin,rekognition,background}.ts"
---

# API ルート（app/web/src/app/api）

新しいルートは近い既存ルートを複製して作る（管理者用は `admin/update-guest`、ゲスト用は `episodes`）。形は次のとおり。

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function _POST(req: Request) {
  try { return await handle(req); } catch (e) {
    console.error("[area/x] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}
// handle(): Bearer トークン → admin().auth.verifyIdToken(idToken, true)
//   無い: 401「認証情報がありません」/ 無効: 401「ログインし直してください」/ 管理者でない: 403
//   本文: try { await req.json() } catch { return fail("リクエストが不正です", 400) } のあと型・長さ・列挙値を検証

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
export const POST = withGuard(
  { name: "area.resource.verb", auth: "user", rateLimit: { key: "uid", limit: 30, windowSec: 60 },
    audit: { action: "resource.verb", target: (b) => b.id } },
  _POST,
);
```

## withGuard（src/lib/route-guard.ts）がすること
本文サイズ（既定 256KB、`maxBodyBytes` で変更）→ 署名の検証（失効チェックなし）→ メンテナンス中は 503（`config/runtime`、管理者と `maintenanceExempt` は通す）→ 管理者ルートの権限（拒否は監査ログに残す）→ レート制限（Firestore `rateLimits`。障害時は通す）→ 監査ログの開始（書けなければ 503。`AUDIT_FAIL_OPEN=true` のときだけ続行）→ 本体 → 監査ログの終了（`after()`）→ `x-request-id` を付ける。

- ラッパーは外側の関所。ハンドラ内の `verifyIdToken(token, true)` を消さない（失効チェックと多層防御）。
- `name` は `area.resource[.verb]`。レート制限のバケット・Sentry のタグ・監査ログの route を兼ねる。
- `rateLimit` は必ず付ける（例外は Worker の webhook だけ）。ログイン前のルートは `key: "ip"`、それ以外は `"uid"`。窓は 60 秒。
- `audit` は更新系のエクスポートだけ。`action` は `entity.verb`。記録されるのは本文のキー名だけで、値は残らない。
- 応答は成功が `{ ok: true, ... }`、失敗が `{ ok: false, message }`（日本語）。クライアント（`src/lib/api-client.ts`）は 202 を成功として扱い、5xx には `（ID: x-request-id の先頭8桁）` を付けて表示する。

## エラーとログ
- `e.message`・`String(e)`・外部 API の応答本文を、レスポンスにも Firestore にも入れない。見せてよい文言だけ `PublicError`（`safeMessage(e, fallback)` が通す）。
- 想定外の失敗は `console.error`（Sentry に届く）、想定内の失敗（パスコード違いなど）は `console.warn`（Sentry に送らない）。
- 時間のかかる外部呼び出しには `export const maxDuration = 60`。投げっぱなしの処理は `background(promise)`（waitUntil）。

## 認証・権限
- ログイン: LINE の ID トークンを `https://api.line.me/oauth2/v2.1/verify` で検証し、uid は `line:<sub>`。`createCustomToken` にはサービスアカウント鍵が要る。
- パスコード（`/api/guest/passcode`）は `WEDDING_PASSCODE` を `timingSafeEqual` で比較し、失敗回数をトランザクションで数えて UID ごとにロックする（5 回で 30 分、2 回めのロックで永久。`src/config/passcode.ts`）。永久ロックは正しいパスコードでも通さず、解除は管理画面から `/api/admin/passcode-unlock`。通過すると `guestAdmin.passcodeClearedAt` が付き、`/api/guest/register` と `/api/guest/invitation` はそれ（または登録済み）を確かめる。招待コード（`/api/invite/redeem`）は `ENABLE_INVITE_CODES` が無いと 410。
- Custom Claims は `applyGuestTags()`（`src/lib/guests-server.ts`）で変える: 既存クレームとマージ、900 バイト超は `PublicError`、変更後に `revokeRefreshTokens`。`admin` は API から変えない。
- タグ ID の検証は、組み込みタグ（`TAG_DEFS`）だけを許すルート（episodes・admin/episodes・roster）と、カスタムタグ（`c_` + 8 桁）も許す `knownTagIds()`（archived を含む。update-guest）が混在している。どちらにするかは Issue の仕様で決め、書かれていなければ確認する。

## 外部サービス
- R2（`src/lib/r2-server.ts`）: `kind` が `"original"` なら非公開バケット `u/{uid}/o/`、それ以外は公開バケット `u/{uid}/t/`。署名に content-type と content-length を含め、既存キーの再署名は `ownsKey()` で本人のキーか確かめる。
- Worker の webhook（`/api/hooks/original-published`）: `x-worker-secret` を最初に `timingSafeEqual` で検証。公開 URL はサーバーが `R2_PUBLIC_BASE` とキーから組み立てる。202 は「まだ紐付いていない」で、エラーではない。
- 画像の取得（`fetchImageBytes`）は https・リダイレクト禁止・許可ホストだけ（SSRF 対策）。許可ホストを増やすときは理由を PR に書く。
- Vertex AI は `vertexAuthOptions()`（サービスアカウントの環境変数、無ければ ADC）。音声合成は `MODAL_TTS_URL` に `x-tts-token` を付けて呼ぶ。どちらも API キーを使わない。
