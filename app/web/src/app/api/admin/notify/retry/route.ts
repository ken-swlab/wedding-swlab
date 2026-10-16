import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { deliverPending } from "@/lib/line-notify-server";
import { LINE_RETRY_BATCH } from "@/config/line-notify";
import { AUDIT_COUNTS_HEADER } from "@/config/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 1件ずつ Messaging API を呼ぶ（通数の確認と送信）。最大 LINE_RETRY_BATCH 件
export const maxDuration = 60;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function _POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[admin/notify/retry] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * 公式 LINE の通知の再送（Issue #168）。アウトボックスの送信待ち（status: pending）を送る。
 *
 * ★失敗した通知は、先に scripts/ops.mjs notify retry で送信待ちに戻す★ ここは送信待ちを送るだけ。
 *   トークン（LINE_CHANNEL_ACCESS_TOKEN）は Vercel の本番にだけあり、手元の ops.mjs からは送れないため、
 *   送るのはサーバー（ここ）にしている。
 * ★再送しても重複して届かない★ 作成時の retryKey を X-Line-Retry-Key に付ける（lib/line-notify-server.ts）。
 * ★管理者だけ★ ゲストの画面から通知を送らせる API は作らない。
 */
async function handle(req: Request) {
  const { auth } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);
  let actorUid: string;
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    if (decoded.admin !== true) return fail("管理者権限が必要です", 403);
    actorUid = decoded.uid;
  } catch {
    return fail("ログインし直してください", 401);
  }

  const counts = await deliverPending(LINE_RETRY_BATCH, actorUid);
  const { sent, failed, skipped } = counts;
  return NextResponse.json(
    { ok: true, sent, failed, skipped },
    { headers: { [AUDIT_COUNTS_HEADER]: JSON.stringify({ sent, failed, skipped }) } },
  );
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const POST = withGuard({ name: "admin.notify.retry", auth: "admin", rateLimit: { key: "uid", limit: 10, windowSec: 60 }, audit: { action: "notify.retry" } }, _POST);
