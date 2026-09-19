"use client";
import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Person } from "@/lib/visibility";
const PAGE = 200;

export function useGuestDirectory(enabled: boolean) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) { setPeople([]); setLoading(false); return; }
    return onSnapshot(query(collection(db, "guests"), limit(PAGE)), (snap) => {
      setPeople(snap.docs.filter((d) => { const v = d.data(); return v.isArchived !== true && !v.mergedInto; })
        .map((d) => {
          const v = d.data();
          return { uid: d.id, name: v.nickname || v.displayName || "ゲスト", kana: v.kana ?? "", tags: Array.isArray(v.tags) ? (v.tags as string[]) : [] };
        }));
      setLoading(false);
    }, () => setLoading(false));
  }, [enabled]);
  return { people, loading };
}
