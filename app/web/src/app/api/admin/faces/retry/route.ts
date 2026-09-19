import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { rebuildDetectedUserIds, resolveGuestUid } from "@/lib/faces-server";
import { cropFace, ensureCollection, fetchImageBytes, normalizeImage, searchFace, type NormalizedImage } from "@/lib/rekognition";
import type { BoundingBox } from "@/types/faces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const BATCH = 12;

function fail(message: string, status: number) { return NextResponse.json({ ok: false, message }, { status }); }

export async function POST(req: Request) {
  try { return await handle(req); } catch (e) {
    console.error("[faces/retry] 未捕捉の例外", e);
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

  const { faceCount } = await ensureCollection();
  if (faceCount === 0) {
    return NextResponse.json({ ok: true, scanned: 0, matched: 0, remaining: 0, message: "まだ学習済みの顔がありません。先に手動で数人ぶん紐付けてください" });
  }

  const snap = await db.collection("faces").where("matchedGuestId", "==", null).orderBy("createdAt", "asc").limit(BATCH + 1).get();
  const docs = snap.docs.slice(0, BATCH);
  const remaining = snap.size > BATCH ? -1 : 0;
  if (docs.length === 0) return NextResponse.json({ ok: true, scanned: 0, matched: 0, remaining: 0 });

  const imageCache = new Map<string, NormalizedImage | null>();
  async function imageFor(url: string): Promise<NormalizedImage | null> {
    if (imageCache.has(url)) return imageCache.get(url)!;
    try {
      const raw = await fetchImageBytes(url); const img = await normalizeImage(raw);
      imageCache.set(url, img); return img;
    } catch (e) {
      console.warn("[faces/retry] 画像を取得できません", url, e);
      imageCache.set(url, null); return null;
    }
  }

  const touchedPosts = new Set<string>();
  let matched = 0;

  for (const doc of docs) {
    const imageUrl = (doc.get("imageUrl") as string) ?? "";
    const box = doc.get("boundingBox") as BoundingBox | undefined;
    if (!imageUrl || !box) continue;
    const img = await imageFor(imageUrl);
    if (!img) continue;

    try {
      const crop = await cropFace(img, box);
      if (!crop) continue;
      const hit = await searchFace(crop);
      if (!hit) continue;

      const guestUid = await resolveGuestUid(hit.guestUid);
      await doc.ref.update({
        matchedGuestId: guestUid, autoMatched: true, similarity: hit.similarity, retriedAt: FieldValue.serverTimestamp(),
      });
      touchedPosts.add(doc.get("postId") as string);
      matched += 1;
    } catch (e) { console.warn("[faces/retry] 照合に失敗", doc.id, e); }
  }

  for (const postId of touchedPosts) { await rebuildDetectedUserIds(postId).catch(() => {}); }
  return NextResponse.json({ ok: true, scanned: docs.length, matched, remaining, posts: touchedPosts.size });
}
