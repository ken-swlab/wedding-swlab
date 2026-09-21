import type { Firestore } from "firebase-admin/firestore";
import { TAG_DEFS, paletteClass, type TagDef } from "@/config/tags";

export type CustomTagDoc = {
  label?: string;
  palette?: string;
  selectable?: boolean;
  community?: boolean;
  archived?: boolean;
  order?: number;
  createdAt?: number;
  createdBy?: string;
};

export async function readCustomTags(db: Firestore): Promise<TagDef[]> {
  const snap = await db.collection("tags").limit(200).get();
  return snap.docs
    .map((d) => {
      const v = d.data() as CustomTagDoc;
      return {
        id: d.id,
        label: v.label || d.id,
        className: paletteClass(v.palette ?? "stone"),
        selectable: v.selectable !== false,
        community: v.community === true,
        archived: v.archived === true,
        order: typeof v.order === "number" ? v.order : 0,
        custom: true,
      } satisfies TagDef;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
