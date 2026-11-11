"use client";

import { COMMUNITY_ALL_TAG } from "@/config/community";
import { tagDef, type TagDef } from "@/config/tags";

/** 画面側のキャッシュの種類（lib/client-cache.ts。Issue #286） */
export const COMMUNITY_CACHE_KIND = "community";
export const PAYMENT_CACHE_KIND = "payment";

export function communityPath(tag: string): string {
  return `/api/guest/community?tag=${encodeURIComponent(tag)}`;
}

/**
 * コミュニティで選べるグループの並び（Issue #174）。「全員」→ 自分が持っているコミュニティのタグ。
 * 承認済・新郎新婦・CTF などの仕組み用のタグは出さない。管理者はすべて。
 * 先頭が最初に開くグループ（ゲストブックの先読みもこれを読む。Issue #286）。
 */
export function communityOptions(allTags: readonly TagDef[], tags: readonly string[], isAdmin: boolean): TagDef[] {
  const mine = allTags.filter((t) => t.community && !t.archived && (isAdmin || tags.includes(t.id)));
  return isAdmin || tags.includes(COMMUNITY_ALL_TAG) ? [tagDef(COMMUNITY_ALL_TAG), ...mine] : mine;
}
