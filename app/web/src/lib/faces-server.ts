import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { IGNORED } from "@/types/faces";

export async function rebuildDetectedUserIds(postId: string): Promise<string[]> {
  const { db } = admin();

  const snap = await db.collection("faces").where("postId", "==", postId).get();

  const ids = new Set<string>();
  for (const d of snap.docs) {
    const m = d.get("matchedGuestId") as string | null;
    if (m && m !== IGNORED) ids.add(m);
  }

  const list = [...ids].sort();
  await db
    .collection("posts")
    .doc(postId)
    .update({ detectedUserIds: list, updatedAt: FieldValue.serverTimestamp() });

  return list;
}

const aliasCache = new Map<string, string>();
export async function resolveGuestUid(uid: string): Promise<string> {
  if (!uid.startsWith("pre_")) return uid;
  const cached = aliasCache.get(uid);
  if (cached) return cached;

  const { db } = admin();
  const snap = await db.collection("guests").doc(uid).get();
  const target = (snap.get("mergedInto") as string) || uid;
  aliasCache.set(uid, target);
  return target;
}
