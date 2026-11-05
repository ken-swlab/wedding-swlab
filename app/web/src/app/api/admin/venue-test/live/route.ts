import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { fail, requireAdmin } from "@/lib/venue-test-server";
import { VENUE_TEST } from "@/config/venue-test";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST: 同時測定を始める（Issue #256）。venueTestLive/current に、今から liveDelayMs 後の開始時刻を書く。
 * 同じ画面（/admin/venue-test）を開いている管理者の端末が購読していて、その時刻に一斉に測り始める。
 * ★開始時刻はサーバーの時計で決める★（押した端末の時計がずれていても、ほかの端末と同じ時刻になる）
 */
async function _POST(req: Request) {
  try {
    const me = await requireAdmin(req);
    if (me instanceof NextResponse) return me;
    const liveId = randomUUID().replace(/-/g, "").slice(0, 20);
    const startAtMs = Date.now() + VENUE_TEST.liveDelayMs;
    await admin().db.collection("venueTestLive").doc("current").set({
      liveId,
      startAt: Timestamp.fromMillis(startAtMs),
      createdBy: me.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, liveId, startAtMs, serverNowMs: Date.now() });
  } catch (e) {
    console.error("[admin/venue-test/live] 同時測定を始められませんでした", e);
    return fail(safeMessage(e), 500);
  }
}

export const POST = withGuard(
  { name: "admin.venueTest.live", auth: "admin", rateLimit: { key: "uid", limit: 10, windowSec: 60 }, audit: { action: "venueTest.live" } },
  _POST,
);
