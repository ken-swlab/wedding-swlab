import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import { migrateTagOrder } from "@/lib/tags-server";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/**
 * POST: タグの並び順の移行（Issue #248。一度だけ）。lib/tags-server.ts の migrateTagOrder を呼ぶ。
 *   並び順がまだ一度も保存されていなければ、以前の承認後の写真の優先順（config/welcome の priority）を先にして、
 *   すべてのタグに order を振る。保存済みなら何もしない（moved: 0）。
 * タグの管理（/admin/tags）と承認後の写真（/admin/welcome）が、並び順が未保存のときだけ開いたときに呼ぶ。
 */
async function _POST(req: Request) {
  try {
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
    const moved = await migrateTagOrder(db);
    return NextResponse.json({ ok: true, moved });
  } catch (e) {
    console.error("[admin/tags/migrate-order] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
export const POST = withGuard(
  {
    name: "admin.tags.migrateOrder",
    auth: "admin",
    rateLimit: { key: "uid", limit: 10, windowSec: 60 },
    audit: { action: "tag.order.migrate", target: () => "tags" },
  },
  _POST,
);
