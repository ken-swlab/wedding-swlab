import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { fail, readJson, requireAdmin } from "@/lib/venue-test-server";
import { VENUE_TEST } from "@/config/venue-test";
import { capacity, summarizeUserAgent, verdictOf, type VenueMetrics } from "@/lib/venue-test";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9]{1,64}$/;
const LIVE_ID_RE = /^[a-f0-9]{1,40}$/;

/** 数字か null。負の数・大きすぎる数（測り間違い・いたずら）は断る */
function num(v: unknown, max: number): number | null | undefined {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max) return undefined;
  return Math.round(v * 1000) / 1000;
}

function parseMetrics(raw: unknown): VenueMetrics | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const m = {
    pingMedianMs: num(r.pingMedianMs, 60_000),
    pingJitterMs: num(r.pingJitterMs, 60_000),
    pingFailed: num(r.pingFailed, VENUE_TEST.pingCount),
    feedScreenSec: num(r.feedScreenSec, 600),
    downMbps: num(r.downMbps, 10_000),
    upMbps: num(r.upMbps, 10_000),
    uploadSecPerPhoto: num(r.uploadSecPerPhoto, 600),
    firestoreMs: num(r.firestoreMs, 600_000),
  };
  if (Object.values(m).some((v) => v === undefined) || m.pingFailed == null) return null;
  return m as VenueMetrics;
}

/**
 * POST: 測定の結果を保存する（Issue #256）。足りる人数の目安と判定はサーバーで計算し直す。
 * ★保存するのは数字・場所・携帯会社・メモ・端末の種類（要約）だけ★ 位置情報・IP・ユーザーエージェントそのものは保存しない。
 */
async function _POST(req: Request) {
  try {
    const me = await requireAdmin(req);
    if (me instanceof NextResponse) return me;
    const body = await readJson(req);
    if (!body) return fail("リクエストが不正です", 400);

    const place = typeof body.place === "string" ? body.place.trim() : "";
    if (!place || [...place].length > VENUE_TEST.placeMax) return fail(`場所は1〜${VENUE_TEST.placeMax}文字で入れてください`, 400);
    const carrier = typeof body.carrier === "string" ? body.carrier : "";
    if (!(VENUE_TEST.carriers as readonly string[]).includes(carrier)) return fail("携帯会社を選んでください", 400);
    const memo = typeof body.memo === "string" ? body.memo.trim() : "";
    if ([...memo].length > VENUE_TEST.memoMax) return fail(`メモは${VENUE_TEST.memoMax}文字までです`, 400);
    const liveId = body.liveId == null ? null : typeof body.liveId === "string" && LIVE_ID_RE.test(body.liveId) ? body.liveId : undefined;
    if (liveId === undefined) return fail("同時測定の指定が不正です", 400);
    const metrics = parseMetrics(body.metrics);
    if (!metrics) return fail("測定の値が不正です", 400);

    const people = capacity(metrics, VENUE_TEST);
    const ref = await admin().db.collection("venueTests").add({
      place,
      carrier,
      memo,
      device: summarizeUserAgent(req.headers.get("user-agent") ?? ""),
      liveId,
      metrics,
      people,
      verdict: verdictOf(people, VENUE_TEST),
      createdBy: me.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    console.error("[admin/venue-test/results] 保存に失敗しました", e);
    return fail(safeMessage(e), 500);
  }
}

/** DELETE: 1件消す（ダッシュボードの「削除」） */
async function _DELETE(req: Request) {
  try {
    const me = await requireAdmin(req);
    if (me instanceof NextResponse) return me;
    const body = await readJson(req);
    const id = typeof body?.id === "string" ? body.id : "";
    if (!ID_RE.test(id)) return fail("リクエストが不正です", 400);
    await admin().db.collection("venueTests").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/venue-test/results] 削除に失敗しました", e);
    return fail(safeMessage(e), 500);
  }
}

export const POST = withGuard(
  { name: "admin.venueTest.create", auth: "admin", rateLimit: { key: "uid", limit: 30, windowSec: 60 }, audit: { action: "venueTest.create" } },
  _POST,
);
export const DELETE = withGuard(
  { name: "admin.venueTest.delete", auth: "admin", rateLimit: { key: "uid", limit: 60, windowSec: 60 }, audit: { action: "venueTest.delete", target: (b) => b.id } },
  _DELETE,
);
