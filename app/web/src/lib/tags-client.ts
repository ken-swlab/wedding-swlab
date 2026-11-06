"use client";

import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { useSyncExternalStore } from "react";
import { db } from "@/lib/firebase";
import {
  allTagDefs,
  applyTagDocs,
  customTagDefs,
  customTagFromDoc,
  isTagOrderSaved,
  isTagPending,
  orderedTagDefs,
  tagDef,
  type TagDef,
  type TagDocData,
} from "@/config/tags";

export type CustomTagDoc = TagDocData;

/** 作ったタグのドキュメントを TagDef にする（作成の直後の楽観更新に使う） */
export function toTagDef(id: string, d: CustomTagDoc): TagDef {
  return customTagFromDoc(id, d);
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
/** 組み込み ∪ カスタムを並び順に（隠した・アーカイブしたものも含む）。タグの管理で使う（Issue #248） */
const SERVER_ORDERED: TagDef[] = orderedTagDefs(true);
let cachedOrdered: TagDef[] = SERVER_ORDERED;
/** 辞書を一度でも受け取ったか（届く前に「並び順が未保存」と決めつけないため） */
let loaded = false;
let started = false;
const listeners = new Set<() => void>();

function start() {
  if (started) return;
  started = true;
  const q = query(collection(db, "tags"), limit(200));
  onSnapshot(
    q,
    (snap) => {
      // ★組み込みの ID のドキュメントは上書き、それ以外は作ったタグ★（Issue #248。config/tags.ts の applyTagDocs）
      applyTagDocs(snap.docs.map((d) => ({ id: d.id, data: d.data() as CustomTagDoc })));
      loaded = true;
      recompute();
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
 * 1つのタグの表示（Issue #231）。★tagDef() を直接読まず、これを通す★
 *   tagDef() は辞書の今の中身を返すだけなので、辞書があとから届いても描き直されない（ID のまま残る）。
 *   ここで useTags と同じ1本の購読に乗り、辞書が届いたら・名前が変わったら描き直す。
 * pending: 名前がまだ分からないカスタムタグ（ID を出さず、枠だけ出す）。
 */
export function useTagDef(id: string): { def: TagDef; pending: boolean } {
  // cachedAll が入れ替わるたびに描き直す（中身はこの下で tagDef から引く）
  useSyncExternalStore(subscribe, () => cachedAll, () => SERVER_SNAPSHOT);
  return { def: tagDef(id), pending: isTagPending(id) };
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
  recompute();
}

function recompute() {
  cachedAll = allTagDefs();
  cachedCustom = customTagDefs();
  cachedOrdered = orderedTagDefs(true);
  cachedOrderState = loaded ? (isTagOrderSaved() ? "saved" : "unsaved") : "loading";
  listeners.forEach((l) => l());
}

let cachedOrderState: "loading" | "saved" | "unsaved" = "loading";

/**
 * 組み込み ∪ カスタムを並び順に（隠した・アーカイブしたものも含む）。タグの管理（/admin/tags）・承認後の写真の
 * 行の順に使う（Issue #248）。useTags と同じ1本の購読を使う。
 */
export function useOrderedTags(): TagDef[] {
  return useSyncExternalStore(subscribe, () => cachedOrdered, () => SERVER_ORDERED);
}

/** 並び順が保存済みか（辞書が届く前は "loading"）。未保存なら、承認後の写真の優先順を写す処理を呼ぶ */
export function useTagOrderState(): "loading" | "saved" | "unsaved" {
  return useSyncExternalStore(subscribe, () => cachedOrderState, () => "loading" as const);
}
