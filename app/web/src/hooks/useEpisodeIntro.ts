"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/lib/api-client";
import { isOnOrAfterEventDay } from "@/lib/invitation-program";
import { EPISODE_COUNT_ENABLED } from "@/config/episode-prompts";
import type { InvitationStatus } from "@/types/invitation";

/**
 * 投稿画面の上に出す値（Issue #284）。どちらも、取れなければ出さない（投稿は止めない）。
 *   afterEvent … 今日（日本時間）が開催日かそれ以降か。開催日は config/invitation の opening.date（招待状の API。
 *                ★リポジトリに書かない★ CLAUDE.md のルール 4a）。分からない間は false（式の前）。
 *   count      … 「いま ◯件の思い出が集まっています」の件数（/api/episodes/count。少ない間は null）。
 * ★このページの読み込みで1回だけ読む★（投稿画面を開くたびに呼ばない）
 */
let eventDate: Promise<string | null> | null = null;
let episodeCount: Promise<number | null> | null = null;

export function useEpisodeIntro(): { afterEvent: boolean; count: number | null } {
  const [afterEvent, setAfterEvent] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    eventDate ??= getJson<InvitationStatus>("/api/guest/invitation")
      .then((s) => s.opening?.date ?? null)
      .catch(() => null);
    void eventDate.then((d) => {
      if (alive && d) setAfterEvent(isOnOrAfterEventDay(d));
    });
    if (EPISODE_COUNT_ENABLED) {
      episodeCount ??= getJson<{ count: number | null }>("/api/episodes/count")
        .then((r) => (typeof r.count === "number" ? r.count : null))
        .catch(() => null);
      void episodeCount.then((n) => {
        if (alive) setCount(n);
      });
    }
    return () => {
      alive = false;
    };
  }, []);
  return { afterEvent, count };
}
