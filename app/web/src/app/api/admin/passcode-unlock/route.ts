import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UID_RE = /^[A-Za-z0-9:_-]{1,128}$/;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function _POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[admin/passcode-unlock] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * パスコードの永久ロック（/api/guest/passcode）を解除する。
 * 失敗回数とロックの回数をすべて消すので、解除後はまた 5 回 × 2 ロックまで試せる。
 */
async function handle(req: Request) {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    if (decoded.admin !== true) return fail("管理者権限が必要です", 403);
  } catch {
    return fail("ログインし直してください", 401);
  }

  let body: { uid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("リクエストが不正です", 400);
  }
  const uid = typeof body.uid === "string" ? body.uid : "";
  if (!UID_RE.test(uid)) return fail("uid が不正です", 400);

  const ref = db.collection("guestAdmin").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return fail("該当するゲストが見つかりません", 404);

  await ref.update({ passcodeAttempts: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true, uid });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const POST = withGuard({ name: "admin.passcode.unlock", auth: "admin", rateLimit: { key: "uid", limit: 30, windowSec: 60 }, audit: { action: "passcode.unlock", target: (b) => b.uid } }, _POST);
