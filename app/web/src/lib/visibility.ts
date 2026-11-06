import { COUPLE_TAG, builtinTagDefs } from "@/config/tags";

/**
 * 人物検索で「同じグループ」とみなす組み込みのタグ。★呼ぶたびに辞書から引く★（Issue #248）
 *   タグの管理でコミュニティを切り替えた・隠した組み込みのタグを反映する（隠したタグは使わない）。作ったタグはまだ見ない（今どおり）。
 */
function communityTags(): Set<string> {
  return new Set(builtinTagDefs().filter((t) => t.community && !t.archived).map((t) => t.id));
}
export type Person = { uid: string; name: string; kana: string; tags: string[]; };

export function isCouple(p: { tags: string[] }): boolean { return p.tags.includes(COUPLE_TAG); }
function sharesCommunity(viewer: Person, other: Person, community: Set<string>): boolean {
  return viewer.tags.some((t) => community.has(t) && other.tags.includes(t));
}
export function searchablePeople(viewer: Person | null, all: Person[]): Person[] {
  if (!viewer) return [];
  const community = communityTags();
  return all.filter((p) => p.uid === viewer.uid || isCouple(p) || sharesCommunity(viewer, p, community));
}
export function classifyPerson(viewer: Person, p: Person): "self" | "couple" | "community" {
  if (p.uid === viewer.uid) return "self";
  if (isCouple(p)) return "couple";
  return "community";
}
