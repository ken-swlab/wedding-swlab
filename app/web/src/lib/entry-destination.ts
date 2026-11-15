"use client";

import { GUESTBOOK_PATHS, isGuestbookPath } from "@/config/guestbook";
import { isGuidePath } from "@/config/guide";
import { deepLinkTarget, withMenuMark } from "@/lib/deep-link";

/**
 * 入口（/ と /invitation）から、ログイン済みの人を移す先（Issue #303）。
 *   リッチメニューの行き先（?to= か liff.state。ゲストブックとご案内の中だけ）があれば、そこへ「リッチメニューから来た」印を付けて。
 *   無ければ今までどおりゲストブックのトップ（(guest)/layout.tsx が前回の画面へ戻す・未登録や未承認を振り分ける）。
 */
export function entryDestination(): string {
  const search = typeof window === "undefined" ? "" : window.location.search;
  const target = deepLinkTarget(search, (p) => isGuestbookPath(p) || isGuidePath(p));
  return target ? withMenuMark(target) : GUESTBOOK_PATHS.home;
}
