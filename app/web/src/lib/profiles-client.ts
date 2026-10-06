"use client";

import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { useSyncExternalStore } from "react";
import { db } from "@/lib/firebase";

/** 他のゲストに見せるプロフィール（guests の公開してよい値だけ） */
export type PublicProfile = {
  name: string;
  photoURL: string;
  bio: string;
};

/** Rules の guests の list 上限（ゲストは 200） */
const PAGE = 200;

/**
 * ゲストのプロフィールの購読（投稿者の名前・アイコン・一言を、表示のたびに最新にする）。
 *
 * ★投稿・コメントに保存した authorName / authorPhotoURL は「投稿したときの値」★
 *   名前やアイコンを変えても過去の投稿には残るので、表示ではここの最新を優先し、
 *   ここに無い人（未登録・取得前・200 人を超えた分）だけ保存した値を使う。
 *   /screen は保存した値のまま（このモジュールを使わない）。
 * ★購読はアプリ全体で1本だけ★ 投稿カードやコメントごとに張ると、数百本のリスナーになる
 *   （tags-client と同じ作り）。
 * ★出すのはニックネームだけ★ 本名は guests に無い（guestPrivate）。
 */
const EMPTY: ReadonlyMap<string, PublicProfile> = new Map();
let cached: ReadonlyMap<string, PublicProfile> = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function start() {
  if (started) return;
  started = true;
  onSnapshot(
    query(collection(db, "guests"), limit(PAGE)),
    (snap) => {
      const next = new Map<string, PublicProfile>();
      for (const d of snap.docs) {
        const v = d.data();
        if (v.isArchived === true || v.mergedInto || v.isRegistered !== true) continue;
        next.set(d.id, {
          name: typeof v.nickname === "string" ? v.nickname.trim() : "",
          photoURL: typeof v.photoURL === "string" ? v.photoURL : "",
          bio: typeof v.bio === "string" ? v.bio : "",
        });
      }
      cached = next;
      listeners.forEach((l) => l());
    },
    (e) => {
      // 失敗しても投稿に保存した値で表示は続く。次に使われたときに張り直す
      console.error("[profiles] ゲストの購読に失敗（投稿に保存した名前・アイコンで継続）", e);
      started = false;
    },
  );
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function useProfiles(): ReadonlyMap<string, PublicProfile> {
  return useSyncExternalStore(subscribe, () => cached, () => EMPTY);
}

/**
 * 投稿者の表示用プロフィール。最新があればそれを、無ければ投稿に保存した値を返す。
 */
export function useAuthorProfile(
  uid: string,
  saved: { name: string; photoURL?: string | null },
): PublicProfile {
  const live = useProfiles().get(uid);
  return {
    name: live?.name || saved.name,
    photoURL: live?.photoURL || saved.photoURL || "",
    bio: live?.bio ?? "",
  };
}
