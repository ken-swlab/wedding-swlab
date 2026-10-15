import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { paymentConfig } from "@/lib/payment-server";
import { paymentBreakdown, type PaymentAttendance } from "@/lib/payment-calc";
import { ATTENDANCE_OPTIONS } from "@/types/admin";
import type { PaymentStatusResponse } from "@/types/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATTENDANCE_VALUES = new Set<string>(ATTENDANCE_OPTIONS.map((o) => o.value));

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function _GET(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[guest/payment] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * 会費の内訳（Issue #148）。
 *
 * ★呼び出した本人の分だけを返す★ uid はトークンから取り、本文やクエリでほかの人を指定させない。
 * ★承認済みだけ★ 承認前は 403（会費は承認されたゲストに案内するもの）。
 * ★金額は config/payment から読む★ コードに書かない。未設定なら configured: false（画面は金額を出さない）。
 * ★管理者だけ、出欠とお車代を差し替えて試せる★（?attendance=both&carFare=1。会費タブの表示確認用）。
 *   差し替えるのは計算の入力だけで、ほかの人のデータは読まない。
 */
async function handle(req: Request) {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  let uid: string;
  let isAdmin: boolean;
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    uid = decoded.uid;
    isAdmin = decoded.admin === true;
  } catch {
    return fail("ログインし直してください", 401);
  }

  const [publicSnap, privateSnap] = await Promise.all([
    db.collection("guests").doc(uid).get(),
    db.collection("guestPrivate").doc(uid).get(),
  ]);
  if (privateSnap.get("isActive") === false) return fail("このアカウントはご利用いただけません", 403);
  if (!isAdmin && publicSnap.get("isApproved") !== true) return fail("承認後にご覧いただけます", 403);

  let attendance = privateSnap.get("attendance") as unknown;
  let carFare = privateSnap.get("carFare") === true;
  const url = new URL(req.url);
  const previewAttendance = url.searchParams.get("attendance");
  if (isAdmin && previewAttendance !== null) {
    if (!ATTENDANCE_VALUES.has(previewAttendance)) return fail("出欠の指定が不正です", 400);
    attendance = previewAttendance;
    carFare = url.searchParams.get("carFare") === "1";
  }
  const att = (typeof attendance === "string" && ATTENDANCE_VALUES.has(attendance) ? attendance : "unanswered") as PaymentAttendance;

  const config = await paymentConfig();
  const res: PaymentStatusResponse = config
    ? { configured: true, attendance: att, ...paymentBreakdown(config, att, carFare) }
    : { configured: false, attendance: att, items: [], totalYen: 0 };
  return NextResponse.json({ ok: true, ...res }, { headers: { "Cache-Control": "private, no-store" } });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _GET の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const GET = withGuard({ name: "guest.payment", auth: "user", rateLimit: { key: "uid", limit: 30, windowSec: 60 } }, _GET);
