"use client";
import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Person } from "@/lib/visibility";
const PAGE = 200;

export function useGuestDirectory(enabled: boolean) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
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
      setLoaded(true);
    }, () => setLoaded(true));
  }, [enabled]);
  // 無効のあいだは空として扱う（以前は effect で空にしていた）
  if (!enabled) return { people: [] as Person[], loading: false };
  return { people, loading: !loaded };
}
