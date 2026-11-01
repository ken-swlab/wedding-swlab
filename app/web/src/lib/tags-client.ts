"use client";

import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { useSyncExternalStore } from "react";
import { db } from "@/lib/firebase";
import { allTagDefs, customTagDefs, paletteClass, registerCustomTags, type TagDef } from "@/config/tags";

export type CustomTagDoc = {
  label?: string;
  palette?: string;
  selectable?: boolean;
  community?: boolean;
  archived?: boolean;
  order?: number;
};

export function toTagDef(id: string, d: CustomTagDoc): TagDef {
  return {
    id,
    label: d.label || id,
    className: paletteClass(d.palette ?? "stone"),
    selectable: d.selectable !== false,
    community: d.community === true,
    archived: d.archived === true,
    order: typeof d.order === "number" ? d.order : 0,
    custom: true,
  };
}

/**
 * タグ辞書の購読。
 * ★購読はアプリ全体で1本だけ★
 *   行ごとに TagPicker を置くため、フックの中で onSnapshot を張ると
 *   ゲスト100人で100本のリスナーになる。
 * 取得に失敗しても組み込みタグだけで動き続ける。
 */
const SERVER_SNAPSHOT: TagDef[] = allTagDefs();
const EMPTY: TagDef[] = [];
let cachedAll: TagDef[] = SERVER_SNAPSHOT;
/** カスタムタグ（アーカイブ済みを含む）。タグの管理（/admin/tags）で使う */
let cachedCustom: TagDef[] = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function start() {
  if (started) return;
  started = true;
  const q = query(collection(db, "tags"), limit(200));
  onSnapshot(
    q,
    (snap) => {
      registerCustomTags(snap.docs.map((d) => toTagDef(d.id, d.data() as CustomTagDoc)));
      cachedAll = allTagDefs();
      cachedCustom = customTagDefs();
      listeners.forEach((l) => l());
    },
    (e) => {
      console.error("[tags] 辞書の購読に失敗（組み込みタグのみで継続）", e);
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

export function useTags(): { allTags: TagDef[] } {
  const allTags = useSyncExternalStore(
    subscribe,
    () => cachedAll,
    () => SERVER_SNAPSHOT,
  );
  return { allTags };
}

/**
 * カスタムタグを、アーカイブ済みも含めて order の順に返す（タグの管理 /admin/tags。Issue #221）。
 * useTags と同じ1本の購読を使う（新しいリスナーは張らない）。
 */
export function useCustomTags(): TagDef[] {
  return useSyncExternalStore(
    subscribe,
    () => cachedCustom,
    () => EMPTY,
  );
}

/** 購読を使わない場所（作成直後・編集の直後など）から手元の辞書を更新したいとき */
export function refreshTagCache() {
  cachedAll = allTagDefs();
  cachedCustom = customTagDefs();
  listeners.forEach((l) => l());
}
