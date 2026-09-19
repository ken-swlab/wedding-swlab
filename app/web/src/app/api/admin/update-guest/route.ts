import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { DEFAULT_GUEST_TAGS, TAG_DEFS } from "@/config/tags";
import {
  ATTENDANCE_OPTIONS, PAYMENT_OPTIONS, type UpdateGuestPayload,
} from "@/types/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWN_TAGS = new Set(TAG_DEFS.map((t) => t.id));
const ATTENDANCE_VALUES = new Set<string>(ATTENDANCE_OPTIONS.map((o) => o.value));
const PAYMENT_VALUES = new Set<string>(PAYMENT_OPTIONS.map((o) => o.value));
const CLAIMS_BYTE_LIMIT = 900;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: Request) {
  const { auth, db } = admin();

  // ---- 呼び出し元が管理者か ---------------------------------
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    if (decoded.admin !== true) return fail("管理者権限が必要です", 403);
  } catch {
    return fail("ログインし直してください", 401);
  }

  // ---- 入力の検証 ------------------------------------------
  let body: UpdateGuestPayload;
  try {
    body = (await req.json()) as UpdateGuestPayload;
  } catch {
    return fail("リクエストが不正です", 400);
  }

  const { uid } = body;
  if (typeof uid !== "string" || !uid) return fail("uid が必要です", 400);

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > 20) {
      return fail("タグは20個までです", 400);
    }
    const unknown = body.tags.filter((t) => !KNOWN_TAGS.has(t));
    if (unknown.length > 0) {
      return fail(`未定義のタグです: ${unknown.join(", ")}`, 400);
    }
  }
  if (body.attendance !== undefined && !ATTENDANCE_VALUES.has(body.attendance)) {
    return fail("出欠の値が不正です", 400);
  }
  if (body.paymentStatus !== undefined && !PAYMENT_VALUES.has(body.paymentStatus)) {
    return fail("送金ステータスの値が不正です", 400);
  }
  if (body.nickname !== undefined &&
      (typeof body.nickname !== "string" || body.nickname.length > 20)) {
    return fail("お名前は20文字までです", 400);
  }
  if (body.allergy !== undefined &&
      (typeof body.allergy !== "string" || body.allergy.length > 500)) {
    return fail("アレルギー情報は500文字までです", 400);
  }
  if (body.aiMemo !== undefined &&
      (typeof body.aiMemo !== "string" || body.aiMemo.length > 2000)) {
    return fail("メモは2000文字までです", 400);
  }

  // ---- Custom Claims の更新 --------------------------------
  let tags: string[] | undefined;

  if (body.tags !== undefined || body.isApproved !== undefined) {
    const user = await auth.getUser(uid);
    const prev = user.customClaims ?? {};
    const existing = Array.isArray(prev.tags) ? (prev.tags as string[]) : [];

    if (body.tags !== undefined) {
      // 明示指定が最優先
      tags = Array.from(new Set(body.tags)).sort();
    } else if (body.isApproved === true) {
      // 承認: タグが空なら初期タグを付与。既に持っていれば触らない。
      tags = existing.length > 0
        ? existing
        : Array.from(new Set(DEFAULT_GUEST_TAGS)).sort();
    } else if (body.isApproved === false) {
      // 承認取り消し: タグを剥がして閲覧できなくする。
      // ただし管理者自身をロックアウトしないよう admin は除外する。
      tags = prev.admin === true ? existing : [];
    }

    if (tags !== undefined) {
      // ★admin フラグはこの API では絶対に触らない★
      const next = { ...prev, tags };
      if (Buffer.byteLength(JSON.stringify(next), "utf8") > CLAIMS_BYTE_LIMIT) {
        return fail("Custom Claims が上限に達しました", 409);
      }
      await auth.setCustomUserClaims(uid, next);
    }
  }

  // ---- Firestore の更新 ------------------------------------
  const batch = db.batch();

  const publicPatch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (body.nickname !== undefined) publicPatch.nickname = body.nickname;
  if (body.isApproved !== undefined) publicPatch.isApproved = body.isApproved;
  if (tags !== undefined) {
    publicPatch.tags = tags;
    // ゲスト側に ID トークンの再取得を促す合図
    publicPatch.claimsUpdatedAt = FieldValue.serverTimestamp();
  }
  batch.set(db.collection("guests").doc(uid), publicPatch, { merge: true });

  if (body.attendance !== undefined || body.allergy !== undefined ||
      body.paymentStatus !== undefined) {
    const privatePatch: Record<string, unknown> = { uid, updatedAt: FieldValue.serverTimestamp() };
    if (body.attendance !== undefined) privatePatch.attendance = body.attendance;
    if (body.allergy !== undefined) privatePatch.allergy = body.allergy;
    if (body.paymentStatus !== undefined) privatePatch.paymentStatus = body.paymentStatus;
    batch.set(db.collection("guestPrivate").doc(uid), privatePatch, { merge: true });
  }

  if (body.aiMemo !== undefined) {
    batch.set(
      db.collection("guestAdmin").doc(uid),
      { uid, aiMemo: body.aiMemo, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

  await batch.commit();

  return NextResponse.json({ ok: true, uid, tags });
}
