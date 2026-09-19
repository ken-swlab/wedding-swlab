import { COUPLE_TAG, TAG_DEFS } from "@/config/tags";

const COMMUNITY_TAGS = new Set(TAG_DEFS.filter((t) => t.community).map((t) => t.id));
export type Person = { uid: string; name: string; kana: string; tags: string[]; };

export function isCouple(p: { tags: string[] }): boolean { return p.tags.includes(COUPLE_TAG); }
function sharesCommunity(viewer: Person, other: Person): boolean {
  return viewer.tags.some((t) => COMMUNITY_TAGS.has(t) && other.tags.includes(t));
}
export function searchablePeople(viewer: Person | null, all: Person[]): Person[] {
  if (!viewer) return [];
  return all.filter((p) => p.uid === viewer.uid || isCouple(p) || sharesCommunity(viewer, p));
}
export function classifyPerson(viewer: Person, p: Person): "self" | "couple" | "community" {
  if (p.uid === viewer.uid) return "self";
  if (isCouple(p)) return "couple";
  return "community";
}
