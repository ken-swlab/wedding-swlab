import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { ATTENDANCE_OPTIONS } from "@/types/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATTENDANCE_VALUES = new Set<string>(ATTENDANCE_OPTIONS.map((o) => o.value));
function fail(message: string, status: number) { return NextResponse.json({ ok: false, message }, { status }); }

export async function POST(req: Request) {
  try { return await handle(req); } catch (e) {
    console.error("[guest/register] 未捕捉の例外", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}

async function handle(req: Request) {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  let uid: string;
  try { uid = (await auth.verifyIdToken(idToken, true)).uid; } catch { return fail("ログインし直してください", 401); }

  let body: { realName?: unknown; kana?: unknown; nickname?: unknown; attendance?: unknown; allergy?: unknown; };
  try { body = (await req.json()) as typeof body; } catch { return fail("リクエストが不正です", 400); }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const realName = str(body.realName); const nickname = str(body.nickname); const kana = str(body.kana); const allergy = str(body.allergy);

  if (!realName || realName.length > 40) return fail("お名前は1〜40文字で入力してください", 400);
  if (!nickname || nickname.length > 20) return fail("ニックネームは1〜20文字で入力してください", 400);
  if (kana.length > 40) return fail("ふりがなは40文字までです", 400);
  if (allergy.length > 500) return fail("アレルギー情報は500文字までです", 400);
  if (typeof body.attendance !== "string" || !ATTENDANCE_VALUES.has(body.attendance)) return fail("出欠の選択が不正です", 400);

  const publicRef = db.collection("guests").doc(uid);
  const privateRef = db.collection("guestPrivate").doc(uid);
  const [publicSnap, privateSnap] = await Promise.all([publicRef.get(), privateRef.get()]);

  const publicPatch: Record<string, unknown> = { realName, nickname, isRegistered: true, updatedAt: FieldValue.serverTimestamp() };
  if (kana) publicPatch.kana = kana;
  if (publicSnap.get("isApproved") === undefined) publicPatch.isApproved = false;

  const privatePatch: Record<string, unknown> = { uid, attendance: body.attendance, allergy, submittedAt: FieldValue.serverTimestamp() };
  if (privateSnap.get("paymentStatus") === undefined) privatePatch.paymentStatus = "none";

  const batch = db.batch();
  batch.set(publicRef, publicPatch, { merge: true });
  batch.set(privateRef, privatePatch, { merge: true });
  await batch.commit();

  return NextResponse.json({ ok: true, nickname });
}
