import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { background } from "@/lib/background";
import {
  cropFace, deleteIndexedFace, fetchImageBytes, indexFace, normalizeImage,
} from "@/lib/rekognition";
import { IGNORED, type BoundingBox } from "@/types/faces";
import { withGuard } from "@/lib/route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function learn(params: {
  faceId: string;
  guestUid: string;
  imageUrl: string;
  box: BoundingBox;
  previousAwsFaceId: string;
}) {
  const { db } = admin();
  const faceRef = db.collection("faces").doc(params.faceId);

  try {
    if (params.previousAwsFaceId) {
      await deleteIndexedFace(params.previousAwsFaceId).catch((e) =>
        console.warn("[faces] 旧 FaceId の削除に失敗", e),
      );
    }

    const raw = await fetchImageBytes(params.imageUrl);
    const img = await normalizeImage(raw);
    const crop = await cropFace(img, params.box);

    if (!crop) {
      await faceRef.update({
        faceIndexStatus: "failed",
        faceIndexError: "切り抜きが小さすぎます",
      });
      return;
    }

    const awsFaceId = await indexFace(crop, params.guestUid);

    await faceRef.update({
      awsFaceId: awsFaceId ?? "",
      faceIndexStatus: awsFaceId ? "indexed" : "failed",
      faceIndexError: awsFaceId ? FieldValue.delete() : "顔を検出できませんでした",
      faceIndexedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    await faceRef
      .update({
        faceIndexStatus: "failed",
        faceIndexError: (e instanceof Error ? e.message : "unknown").slice(0, 200),
      })
      .catch(() => {});
  }
}

async function _POST(req: Request) {
  const { auth, db } = admin();

  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  let actor: string;
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    if (decoded.admin !== true) return fail("管理者権限が必要です", 403);
    actor = decoded.uid;
  } catch {
    return fail("ログインし直してください", 401);
  }

  let body: { faceId?: string; guestUid?: string | null };
  try {
    body = (await req.json()) as { faceId?: string; guestUid?: string | null };
  } catch {
    return fail("リクエストが不正です", 400);
  }

  const { faceId } = body;
  if (typeof faceId !== "string" || !faceId) return fail("faceId が必要です", 400);

  const guestUid = body.guestUid ?? null;
  if (guestUid !== null && (typeof guestUid !== "string" || guestUid.length > 128)) {
    return fail("guestUid が不正です", 400);
  }

  if (guestUid && guestUid !== IGNORED) {
    const g = await db.collection("guests").doc(guestUid).get();
    if (!g.exists) return fail("該当するゲストがいません", 404);
  }

  const faceRef = db.collection("faces").doc(faceId);
  const before = await faceRef.get();
  if (!before.exists) return fail("顔データが見つかりません", 404);

  const imageUrl = (before.get("imageUrl") as string) ?? "";
  const box = before.get("boundingBox") as BoundingBox;
  const previousAwsFaceId = (before.get("awsFaceId") as string) ?? "";

  try {
    const postId = await db.runTransaction(async (tx) => {
      const snap = await tx.get(faceRef);
      if (!snap.exists) throw new Error("顔データが見つかりません");

      const pid = snap.get("postId") as string;

      const siblings = await tx.get(db.collection("faces").where("postId", "==", pid));

      const ids = new Set<string>();
      for (const d of siblings.docs) {
        const m = d.id === faceId ? guestUid : (d.get("matchedGuestId") as string | null);
        if (m && m !== IGNORED) ids.add(m);
      }

      tx.update(faceRef, {
        matchedGuestId: guestUid,
        autoMatched: false,
        matchedAt: FieldValue.serverTimestamp(),
        matchedBy: actor,
        faceIndexStatus:
          guestUid && guestUid !== IGNORED ? "indexing" : "none",
      });

      tx.update(db.collection("posts").doc(pid), {
        detectedUserIds: [...ids].sort(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return pid;
    });

    if (guestUid && guestUid !== IGNORED && imageUrl && box) {
      await background(
        learn({ faceId, guestUid, imageUrl, box, previousAwsFaceId }),
      );
    } else if (previousAwsFaceId) {
      await background(
        (async () => {
          await deleteIndexedFace(previousAwsFaceId).catch(() => {});
          await faceRef.update({ awsFaceId: "", faceIndexStatus: "none" }).catch(() => {});
        })(),
      );
    }

    return NextResponse.json({ ok: true, faceId, guestUid, postId });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "更新に失敗しました", 409);
  }
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const POST = withGuard({ name: "admin.faces.match", auth: "admin", rateLimit: { key: "uid", limit: 120, windowSec: 60 }, audit: { action: "face.match", target: (b) => b.faceId } }, _POST);
