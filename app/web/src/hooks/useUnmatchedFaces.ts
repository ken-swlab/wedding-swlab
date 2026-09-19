"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection, limit, onSnapshot, orderBy, query, where,
  type FirestoreError,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { BoundingBox, FaceDoc } from "@/types/faces";

const PAGE = 300;

export function useUnmatchedFaces(enabled: boolean) {
  const [faces, setFaces] = useState<FaceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);

    const q = query(
      collection(db, "faces"),
      where("matchedGuestId", "==", null),
      orderBy("createdAt", "desc"),
      limit(PAGE),
    );

    return onSnapshot(
      q,
      (snap) => {
        setFaces(
          snap.docs.map((d) => {
            const v = d.data();
            return {
              id: d.id,
              postId: v.postId ?? "",
              mediaIndex: v.mediaIndex ?? 0,
              imageUrl: v.imageUrl ?? "",
              boundingBox: v.boundingBox as BoundingBox,
              confidence: v.confidence ?? 0,
              matchedGuestId: null,
              autoMatched: v.autoMatched === true,
              similarity: v.similarity ?? 0,
              awsFaceId: v.awsFaceId ?? "",
              authorUid: v.authorUid ?? "",
              authorName: v.authorName ?? "ゲスト",
              postText: v.postText ?? "",
              createdAt: v.createdAt ?? null,
            };
          }),
        );
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e);
        setLoading(false);
      },
    );
  }, [enabled]);

  const ordered = useMemo(
    () =>
      [...faces].sort((a, b) => {
        if (a.postId !== b.postId) return a.postId < b.postId ? -1 : 1;
        if (a.mediaIndex !== b.mediaIndex) return a.mediaIndex - b.mediaIndex;
        return a.boundingBox.Left - b.boundingBox.Left;
      }),
    [faces],
  );

  return { faces: ordered, loading, error };
}
