"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson } from "@/lib/api-client";
import type { Episode } from "@/types/episode";

/**
 * エピソード一覧。
 * Firestore を直接購読せず API 越しに取るのは、
 * 承認・編集の結果を1つの経路（PUT → refresh）に集約するため。
 */
export function useEpisodes(enabled: boolean) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const r = await getJson<{ episodes: Episode[] }>("/api/admin/episodes?status=all");
      setEpisodes(Array.isArray(r.episodes) ? r.episodes : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) void refresh();
    else setLoading(false);
  }, [enabled, refresh]);

  return { episodes, loading, error, refresh };
}
