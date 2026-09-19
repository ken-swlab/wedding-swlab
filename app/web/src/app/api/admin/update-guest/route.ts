import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { applyGuestTags, readGuestClaims } from "@/lib/guests-server";
import { DEFAULT_GUEST_TAGS, TAG_DEFS } from "@/config/tags";
import { ATTENDANCE_OPTIONS, PAYMENT_OPTIONS, type UpdateGuestPayload } from "@/types/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWN_TAGS = new Set(TAG_DEFS.map((t) => t.id));
const ATTENDANCE_VALUES = new Set<string>(ATTENDANCE_OPTIONS.map((o) => o.value));
const PAYMENT_VALUES = new Set<string>(PAYMENT_OPTIONS.map((o) => o.value));
const FACE_PATH_RE = /^reference_faces\/[A-Za-z0-9:_.-]{1,128}\/[A-Za-z0-9-]{1,64}\.jpg$/;

function fail(message: string, status: number) { return NextResponse.json({ ok: false, message }, { status }); }
function isOurStorageUrl(url: string): boolean {
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucket) return false;
  return url.startsWith(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/`);
}

export async function POST(req: Request) {
  try { return await handle(req); } catch (e) {
    console.error("[update-guest] 未捕捉の例外", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}

async function handle(req: Request) {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    if (decoded.admin !== true) return fail("管理者権限が必要です", 403);
  } catch { return fail("ログインし直してください", 401); }

  let body: UpdateGuestPayload;
  try { body = (await req.json()) as UpdateGuestPayload; } catch { return fail("リクエストが不正です", 400); }

  const { uid } = body;
  if (typeof uid !== "string" || !uid) return fail("uid が必要です", 400);

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > 20) return fail("タグは20個までです", 400);
    const unknown = body.tags.filter((t) => !KNOWN_TAGS.has(t));
    if (unknown.length > 0) return fail(`未定義のタグです: ${unknown.join(", ")}`, 400);
  }
  if (body.attendance !== undefined && !ATTENDANCE_VALUES.has(body.attendance)) return fail("出欠の値が不正です", 400);
  if (body.paymentStatus !== undefined && !PAYMENT_VALUES.has(body.paymentStatus)) return fail("送金ステータスの値が不正です", 400);
  if (body.nickname !== undefined && (typeof body.nickname !== "string" || body.nickname.length > 20)) return fail("ニックネームは20文字までです", 400);
  if (body.allergy !== undefined && (typeof body.allergy !== "string" || body.allergy.length > 500)) return fail("アレルギー情報は500文字までです", 400);
  if (body.aiMemo !== undefined && (typeof body.aiMemo !== "string" || body.aiMemo.length > 2000)) return fail("メモは2000文字までです", 400);

  const hasFaceUrl = body.referencePhotoUrl !== undefined;
  const hasFacePath = body.referencePhotoPath !== undefined;
  if (hasFaceUrl !== hasFacePath) return fail("参照顔写真は URL とパスを同時に指定してください", 400);
  if (hasFaceUrl && body.referencePhotoUrl !== null) {
    if (typeof body.referencePhotoUrl !== "string" || !isOurStorageUrl(body.referencePhotoUrl)) return fail("参照顔写真の URL が不正です", 400);
    if (typeof body.referencePhotoPath !== "string" || !FACE_PATH_RE.test(body.referencePhotoPath)) return fail("参照顔写真のパスが不正です", 400);
  }

  let tags: string[] | undefined;
  let claimsUpdated = false;

  if (body.tags !== undefined || body.isApproved !== undefined) {
    const current = await readGuestClaims(uid);
    if (body.tags !== undefined) {
      tags = Array.from(new Set(body.tags)).sort();
    } else if (body.isApproved === true) {
      // ★必ず和集合★ 統合済みゲストはタグが空でないため
      //   「空のときだけ付与」だと all が抜けて画面が真っ白になる。
      tags = [...new Set([...current.tags, ...DEFAULT_GUEST_TAGS])].sort();
    } else if (body.isApproved === false) {
      tags = current.isAdmin ? current.tags : [];
    }
    if (tags !== undefined) {
      const applied = await applyGuestTags(uid, tags);
      tags = applied.tags;
      claimsUpdated = applied.claimsUpdated;
    }
  }

  const batch = db.batch();
  const publicPatch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (body.nickname !== undefined) publicPatch.nickname = body.nickname;
  if (body.isApproved !== undefined) publicPatch.isApproved = body.isApproved;
  if (tags !== undefined) {
    publicPatch.tags = tags;
    if (claimsUpdated) publicPatch.claimsUpdatedAt = FieldValue.serverTimestamp();
  }
  batch.set(db.collection("guests").doc(uid), publicPatch, { merge: true });

  if (body.attendance !== undefined || body.allergy !== undefined || body.paymentStatus !== undefined) {
    const privatePatch: Record<string, unknown> = { uid, updatedAt: FieldValue.serverTimestamp() };
    if (body.attendance !== undefined) privatePatch.attendance = body.attendance;
    if (body.allergy !== undefined) privatePatch.allergy = body.allergy;
    if (body.paymentStatus !== undefined) privatePatch.paymentStatus = body.paymentStatus;
    batch.set(db.collection("guestPrivate").doc(uid), privatePatch, { merge: true });
  }

  if (body.aiMemo !== undefined || hasFaceUrl) {
    const adminPatch: Record<string, unknown> = { uid, updatedAt: FieldValue.serverTimestamp() };
    if (body.aiMemo !== undefined) adminPatch.aiMemo = body.aiMemo;
    if (hasFaceUrl) {
      const clearing = body.referencePhotoUrl === null;
      adminPatch.referencePhotoUrl = clearing ? "" : body.referencePhotoUrl;
      adminPatch.referencePhotoPath = clearing ? "" : body.referencePhotoPath;
      adminPatch.faceIndexStatus = clearing ? "none" : "pending";
      adminPatch.referencePhotoUpdatedAt = FieldValue.serverTimestamp();
    }
    batch.set(db.collection("guestAdmin").doc(uid), adminPatch, { merge: true });
  }
  await batch.commit();

  return NextResponse.json({ ok: true, uid, tags, claimsUpdated });
}
