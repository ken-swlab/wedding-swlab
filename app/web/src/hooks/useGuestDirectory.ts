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
      /**
       * ★候補に出すのは「本登録が済んだゲストのニックネームだけ」★
       *   displayName / kana は本名そのものなので guestPrivate へ移した。
       *   仮登録（pre_xxx）はまだ本人がログインしていない名簿行なので、
       *   メンション候補に出す意味がない。
       */
      setPeople(snap.docs
        .filter((d) => {
          const v = d.data();
          return v.isArchived !== true && !v.mergedInto && v.isRegistered === true;
        })
        .map((d) => {
          const v = d.data();
          return { uid: d.id, name: v.nickname || "ゲスト", kana: "", tags: Array.isArray(v.tags) ? (v.tags as string[]) : [] };
        }));
      setLoading(false);
    }, () => setLoading(false));
  }, [enabled]);
  return { people, loading };
}
