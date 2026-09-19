import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { background } from "@/lib/background";
import { rebuildDetectedUserIds } from "@/lib/faces-server";
import {
  cropFace, detectFaces, ensureCollection, fetchImageBytes, normalizeImage,
} from "@/lib/rekognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SCAN_LIMIT = 3;


const aliasCache = new Map<string, string>();
async function resolveGuestUid(uid: string): Promise<string> {
  if (!uid.startsWith("pre_")) return uid;
  const cached = aliasCache.get(uid);
  if (cached) return cached;
  const { db } = admin();
  const snap = await db.collection("guests").doc(uid).get();
  const target = (snap.get("mergedInto") as string) || uid;
  aliasCache.set(uid, target);
  return target;
}

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

type Media = { type?: string; url?: string };

async function processPost(postId: string): Promise<{ faces: number; auto: number }> {
  const { db } = admin();
  const postRef = db.collection("posts").doc(postId);
  const snap = await postRef.get();
  if (!snap.exists) return { faces: 0, auto: 0 };

  const data = snap.data()!;
  const media = (data.media ?? []) as Media[];
  const images = media
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.type === "image" && typeof m.url === "string");

  if (images.length === 0) {
    await postRef.update({ faceDetectionStatus: "skipped" });
    return { faces: 0, auto: 0 };
  }

  const { faceCount } = await ensureCollection();
  const canSearch = faceCount > 0;

  const batch = db.batch();
  let total = 0;
  let auto = 0;

  for (const { m, i } of images) {
    const raw = await fetchImageBytes(m.url!);
    const img = await normalizeImage(raw);
    const faces = await detectFaces(img.data);

    for (let n = 0; n < faces.length; n++) {
      const f = faces[n];
      let matchedGuestId: string | null = null;
      let similarity = 0;

      if (canSearch) {
        try {
          const crop = await cropFace(img, f.boundingBox);
          if (crop) {
            const { searchFace } = await import("@/lib/rekognition");
            const hit = await searchFace(crop);
            if (hit) {
              matchedGuestId = await resolveGuestUid(hit.guestUid);
              similarity = hit.similarity;
              auto += 1;
            }
          }
        } catch (e) {
          console.warn("[faces] 自動照合に失敗", e);
        }
      }

      batch.set(
        db.collection("faces").doc(`${postId}_${i}_${n}`),
        {
          postId,
          mediaIndex: i,
          imageUrl: m.url,
          boundingBox: f.boundingBox,
          confidence: f.confidence,
          matchedGuestId,
          autoMatched: matchedGuestId !== null,
          similarity,
          authorUid: data.authorUid ?? "",
          authorName: data.authorName ?? "ゲスト",
          postText: String(data.text ?? "").slice(0, 120),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      total += 1;
    }
  }

  batch.update(postRef, {
    faceDetectionStatus: "done",
    faceCount: total,
    faceAutoMatched: auto,
    faceDetectedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  if (auto > 0) await rebuildDetectedUserIds(postId);

  return { faces: total, auto };
}

async function markFailed(postId: string, reason: string) {
  const { db } = admin();
  await db
    .collection("posts")
    .doc(postId)
    .update({
      faceDetectionStatus: "failed",
      faceDetectionError: reason.slice(0, 200),
    })
    .catch(() => {});
}

export async function POST(req: Request) {
  const { auth, db } = admin();

  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  let uid: string;
  let isAdminCaller = false;
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    uid = decoded.uid;
    isAdminCaller = decoded.admin === true;
  } catch {
    return fail("ログインし直してください", 401);
  }

  let body: { postId?: string; scan?: boolean };
  try {
    body = (await req.json()) as { postId?: string; scan?: boolean };
  } catch {
    return fail("リクエストが不正です", 400);
  }

  if (body.scan) {
    if (!isAdminCaller) return fail("管理者権限が必要です", 403);

    const pending = await db
      .collection("posts")
      .where("faceDetectionStatus", "in", ["pending", "failed"])
      .orderBy("createdAt", "desc")
      .limit(SCAN_LIMIT + 1)
      .get();

    const ids = pending.docs.slice(0, SCAN_LIMIT).map((d) => d.id);
    const more = pending.size > SCAN_LIMIT;

    await background(
      (async () => {
        for (const id of ids) {
          try {
            await processPost(id);
          } catch (e) {
            await markFailed(id, e instanceof Error ? e.message : "unknown");
          }
        }
      })(),
    );

    return NextResponse.json({ ok: true, queued: ids.length, more }, { status: 202 });
  }

  const postId = body.postId;
  if (typeof postId !== "string" || !postId) return fail("postId が必要です", 400);

  const postSnap = await db.collection("posts").doc(postId).get();
  if (!postSnap.exists) return fail("投稿が見つかりません", 404);
  if (!isAdminCaller && postSnap.get("authorUid") !== uid) {
    return fail("権限がありません", 403);
  }
  if (postSnap.get("faceDetectionStatus") === "done") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await postSnap.ref.update({ faceDetectionStatus: "pending" });

  await background(
    processPost(postId).catch((e) =>
      markFailed(postId, e instanceof Error ? e.message : "unknown"),
    ),
  );

  return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
}
