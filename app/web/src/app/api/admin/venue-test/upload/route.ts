import { NextResponse } from "next/server";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { fail, readJson, requireAdmin } from "@/lib/venue-test-server";
import { deleteVenueUploads, newVenueUploadKey, presignPut } from "@/lib/r2-server";
import { VENUE_TEST } from "@/config/venue-test";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 1MB のダミー画像として送らせる形（今の投稿と同じ「予約 → 直接送る」。中身は端末で作る乱数） */
const CONTENT_TYPE = "image/jpeg";

/**
 * POST: 写真を送る速さを測るための、送り先の予約（Issue #256）。公開バケットの test/venue/up/ に upload.count 個。
 * ★本番の投稿の置き場所（u/{uid}/…）とは分ける★ キーはサーバーが決め、大きさと型を署名に含める（R2 が違う PUT を断る）。
 */
async function _POST(req: Request) {
  try {
    const me = await requireAdmin(req);
    if (me instanceof NextResponse) return me;
    const { bytes, count } = VENUE_TEST.upload;
    const slots = await Promise.all(
      Array.from({ length: count }, async () => {
        const key = newVenueUploadKey(VENUE_TEST.uploadPrefix);
        return { key, url: await presignPut("thumb", key, CONTENT_TYPE, bytes) };
      }),
    );
    return NextResponse.json({ ok: true, contentType: CONTENT_TYPE, bytes, slots });
  } catch (e) {
    console.error("[admin/venue-test/upload] 送り先を予約できませんでした", e);
    return fail(safeMessage(e), 500);
  }
}

/** DELETE: 送ったダミー画像を、測り終わったらすぐ消す。★test/venue/up/ の形のキーしか消さない★ */
async function _DELETE(req: Request) {
  try {
    const me = await requireAdmin(req);
    if (me instanceof NextResponse) return me;
    const body = await readJson(req);
    const keys = Array.isArray(body?.keys) ? body.keys.filter((k): k is string => typeof k === "string").slice(0, VENUE_TEST.upload.count) : [];
    if (keys.length === 0) return fail("リクエストが不正です", 400);
    const r = await deleteVenueUploads(keys);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[admin/venue-test/upload] ダミー画像を消せませんでした", e);
    return fail(safeMessage(e), 500);
  }
}

export const POST = withGuard(
  { name: "admin.venueTest.upload", auth: "admin", external: true, rateLimit: { key: "uid", limit: 20, windowSec: 60 } },
  _POST,
);
export const DELETE = withGuard(
  { name: "admin.venueTest.cleanup", auth: "admin", external: true, rateLimit: { key: "uid", limit: 20, windowSec: 60 }, audit: { action: "venueTest.cleanup" } },
  _DELETE,
);
