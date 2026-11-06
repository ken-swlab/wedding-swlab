"use client";

import { MAX_ORIGINAL_BYTES } from "@/config/limits";

/**
 * 投稿画面とコメントの書きかけを端末に残す（Issue #273）。閉じて開き直しても、続きから書ける。
 *
 *   本文・公開範囲・エピソード … localStorage（wb:draft:composer:{uid}）
 *   選んだ写真・動画          … IndexedDB（wedding-drafts。送信待ちの原本の wedding-uploads とは別の DB）
 *   コメント                  … localStorage（wb:draft:comment:{uid}:{postId}）
 *
 * ★送信したら・捨てたら消す★ サインアウト（clearDeviceData）でもすべて消す（clearAllDrafts）。
 * ★写真は Blob ではなく ArrayBuffer で持つ★（WebKit の不具合対策。upload-queue と同じ）
 * ★原本の上限（MAX_ORIGINAL_BYTES）より大きいもの（長い動画）は残さない★ 端末の空きを使い切らない。
 * ★wedding-uploads の DB_VERSION には触れない★（未送信の原本が消える。.claude/rules/media.md）
 */
const TEXT_PREFIX = "wb:draft:composer:";
const COMMENT_PREFIX = "wb:draft:comment:";
const DB_NAME = "wedding-drafts";
const DB_VERSION = 1;
const STORE = "files";

export type ComposerDraftText = { text: string; selected: string[]; episodeOn: boolean; theme: string };

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 書けなくても続ける */
  }
}
function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 消せなくても続ける */
  }
}

export function saveComposerText(uid: string, v: ComposerDraftText) {
  const empty = !v.text.trim() && !v.episodeOn;
  if (empty) remove(TEXT_PREFIX + uid);
  else writeJson(TEXT_PREFIX + uid, v);
}
export function readComposerText(uid: string): ComposerDraftText | null {
  const v = readJson<Partial<ComposerDraftText>>(TEXT_PREFIX + uid);
  if (!v || typeof v.text !== "string") return null;
  return {
    text: v.text,
    selected: Array.isArray(v.selected) ? v.selected.filter((x): x is string => typeof x === "string") : [],
    episodeOn: v.episodeOn === true,
    theme: typeof v.theme === "string" ? v.theme : "",
  };
}

export function saveCommentDraft(uid: string, postId: string, text: string) {
  if (text.trim()) writeJson(COMMENT_PREFIX + uid + ":" + postId, text);
  else remove(COMMENT_PREFIX + uid + ":" + postId);
}
export function readCommentDraft(uid: string, postId: string): string {
  const v = readJson<unknown>(COMMENT_PREFIX + uid + ":" + postId);
  return typeof v === "string" ? v : "";
}

// ---- 写真・動画（IndexedDB）--------------------------------------------------

type StoredFile = { id: string; uid: string; order: number; name: string; type: string; lastModified: number; buffer: ArrayBuffer };

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("indexedDB がありません"));
  if (dbPromise) return dbPromise;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("uid", "uid", { unique: false });
    };
    req.onsuccess = () => {
      const d = req.result;
      d.onversionchange = () => {
        d.close();
        dbPromise = null;
      };
      resolve(d);
    };
    req.onerror = () => reject(req.error);
  });
  dbPromise = p.catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (d) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

/** 選んだ写真・動画を1つ残す（大きすぎるものは残さない）。失敗しても投稿画面は止めない */
export async function saveDraftFile(uid: string, id: string, order: number, file: File): Promise<void> {
  if (file.size > MAX_ORIGINAL_BYTES) return;
  try {
    const buffer = await file.arrayBuffer();
    const v: StoredFile = { id, uid, order, name: file.name, type: file.type, lastModified: file.lastModified, buffer };
    await tx("readwrite", (s) => s.put(v));
  } catch (e) {
    console.warn("[draft] 写真を残せませんでした", e);
  }
}

export async function removeDraftFile(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* 消せなくても続ける */
  }
}

/** 残した写真・動画を、選んだ順に File に戻す */
export async function readDraftFiles(uid: string): Promise<{ id: string; file: File }[]> {
  try {
    const all = ((await tx<StoredFile[]>("readonly", (s) => s.index("uid").getAll(uid))) ?? []).sort((a, b) => a.order - b.order);
    return all.map((v) => ({ id: v.id, file: new File([v.buffer], v.name, { type: v.type, lastModified: v.lastModified }) }));
  } catch {
    return [];
  }
}

/** 投稿画面の書きかけ（本文と写真）を消す（送信した・捨てた） */
export async function clearComposerDraft(uid: string): Promise<void> {
  remove(TEXT_PREFIX + uid);
  try {
    const all = (await tx<StoredFile[]>("readonly", (s) => s.index("uid").getAll(uid))) ?? [];
    await tx("readwrite", (s) => {
      for (const v of all) s.delete(v.id);
    });
  } catch {
    /* 消せなくても続ける */
  }
}

/** サインアウトのとき（clearDeviceData）: 書きかけをすべて消す */
export async function clearAllDrafts(): Promise<void> {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(TEXT_PREFIX) || k.startsWith(COMMENT_PREFIX))) keys.push(k);
    }
    keys.forEach(remove);
  } catch {
    /* 消せなくても続ける */
  }
  try {
    const d = await dbPromise?.catch(() => null);
    d?.close();
    dbPromise = null;
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  } catch {
    /* 消せなくても続ける */
  }
}
