import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { ATTENDANCE_OPTIONS, type RegisterPayload } from "@/types/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATTENDANCE_VALUES = new Set<string>(ATTENDANCE_OPTIONS.map((o) => o.value));

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: Request) {
  const { auth, db } = admin();

  // ---- 認証 ------------------------------------------------
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  let uid: string;
  try {
    uid = (await auth.verifyIdToken(idToken, true)).uid;
  } catch {
    return fail("ログインし直してください", 401);
  }

  // ---- 入力の検証 ------------------------------------------
  let body: RegisterPayload;
  try {
    body = (await req.json()) as RegisterPayload;
  } catch {
    return fail("リクエストが不正です", 400);
  }

  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
  if (!nickname || nickname.length > 20) {
    return fail("お名前は1〜20文字で入力してください", 400);
  }
  if (!ATTENDANCE_VALUES.has(body.attendance)) {
    return fail("出欠の選択が不正です", 400);
  }
  const allergy = typeof body.allergy === "string" ? body.allergy.trim() : "";
  if (allergy.length > 500) {
    return fail("アレルギー情報は500文字までです", 400);
  }

  // ---- 保存 ------------------------------------------------
  // ★isApproved はこのAPIでは絶対に true にしない★
  //   承認は /api/admin/update-guest からのみ行う。
  const publicRef = db.collection("guests").doc(uid);
  const privateRef = db.collection("guestPrivate").doc(uid);

  const [publicSnap, privateSnap] = await Promise.all([publicRef.get(), privateRef.get()]);

  const publicPatch: Record<string, unknown> = {
    nickname,
    isRegistered: true,
    updatedAt: FieldValue.serverTimestamp(),
  };
  // 初回だけ false を書き込む（再提出で承認が取り消されないように）
  if (publicSnap.get("isApproved") === undefined) publicPatch.isApproved = false;

  const privatePatch: Record<string, unknown> = {
    uid,
    attendance: body.attendance,
    allergy,
    submittedAt: FieldValue.serverTimestamp(),
  };
  if (privateSnap.get("paymentStatus") === undefined) privatePatch.paymentStatus = "none";

  const batch = db.batch();
  batch.set(publicRef, publicPatch, { merge: true });
  batch.set(privateRef, privatePatch, { merge: true });
  await batch.commit();

  return NextResponse.json({ ok: true, nickname });
}
