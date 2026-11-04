import type { Firestore } from "firebase-admin/firestore";
import {
  TAG_DEFS,
  applyTagDocs,
  customTagDefs,
  isTagOrderSaved,
  orderedTagDefs,
  tagOrderIds,
  type TagDef,
  type TagDocData,
} from "@/config/tags";

export type CustomTagDoc = TagDocData & {
  createdAt?: number;
  createdBy?: string;
};

/**
 * tags コレクションを読み、辞書（config/tags.ts）に入れる（Issue #248）。
 * ★組み込みの ID のドキュメントは上書き、それ以外は作ったタグ★ 読み込みのたびに辞書を置き換える。
 */
export async function loadTagDictionary(db: Firestore): Promise<void> {
  const snap = await db.collection("tags").limit(200).get();
  applyTagDocs(snap.docs.map((d) => ({ id: d.id, data: d.data() as CustomTagDoc })));
}

/** 作ったタグ（アーカイブ済みを含む。組み込みのタグの上書きは含まない）を並び順に */
export async function readCustomTags(db: Firestore): Promise<TagDef[]> {
  await loadTagDictionary(db);
  return customTagDefs();
}

/** 組み込み ∪ 作ったタグを並び順に（隠した・アーカイブしたものも含む） */
export async function readOrderedTags(db: Firestore): Promise<TagDef[]> {
  await loadTagDictionary(db);
  return orderedTagDefs(true);
}

/**
 * 既知のタグ ID 集合。
 * ★archived も含める★
 *   そのタグを既に持っているゲストの「別の項目」を保存しようとしたときに
 *   「未定義のタグです」で弾かれてしまうため。
 */
export async function knownTagIds(db: Firestore): Promise<Set<string>> {
  const custom = await readCustomTags(db);
  return new Set([...TAG_DEFS.map((t) => t.id), ...custom.map((t) => t.id)]);
}

/** config/welcome の、以前の優先順（priority。Issue #215）。形が違えば空 */
function legacyWelcomePriority(data: unknown): string[] {
  const p = data && typeof data === "object" ? (data as { priority?: unknown }).priority : undefined;
  if (!Array.isArray(p)) return [];
  return [...new Set(p.filter((t): t is string => typeof t === "string" && /^[A-Za-z0-9_]{1,40}$/.test(t)))];
}

/**
 * 承認後の写真に使うタグの優先順（Issue #248）。
 * ★ふだんはタグの並び順（タグの管理）★ まだ並び順が一度も保存されていない（下の移行の前）ときだけ、
 *   以前の config/welcome の priority を先に置く（移行するまで、ゲストに届く写真が変わらないように）。
 */
export async function welcomeTagOrder(db: Firestore, welcomeData: unknown): Promise<string[]> {
  await loadTagDictionary(db);
  const order = tagOrderIds();
  if (isTagOrderSaved()) return order;
  const legacy = legacyWelcomePriority(welcomeData);
  if (legacy.length === 0) return order;
  const legacySet = new Set(legacy);
  return [...legacy, ...order.filter((t) => !legacySet.has(t))];
}

/**
 * 移行（Issue #248。一度だけ）: タグの並び順がまだ一度も保存されていなければ、すべてのタグに order を振る。
 *   以前の承認後の写真の優先順（config/welcome の priority）があれば、その順を先にする。
 *   ★並び順を一度でも保存していれば何もしない★（タグの管理で並べ替えた順を上書きしない）。
 *   ★priority は消さない★ 読み込みでは使わなくなるだけ（残っていても壊れない）。
 * 呼ぶのはタグの管理（/admin/tags）と承認後の写真（/admin/welcome）を開いたとき。何度呼んでもよい。
 * 返り値: 振り直したタグの数（何もしなければ 0）
 */
export async function migrateTagOrder(db: Firestore): Promise<number> {
  await loadTagDictionary(db);
  if (isTagOrderSaved()) return 0;
  const welcome = await db.collection("config").doc("welcome").get();
  const order = await welcomeTagOrder(db, welcome.exists ? welcome.data() : undefined);
  const known = new Set(orderedTagDefs(true).map((t) => t.id));
  const ids = order.filter((t) => known.has(t));
  const batch = db.batch();
  ids.forEach((id, i) => batch.set(db.collection("tags").doc(id), { order: i, updatedAt: Date.now() }, { merge: true }));
  await batch.commit();
  return ids.length;
}
