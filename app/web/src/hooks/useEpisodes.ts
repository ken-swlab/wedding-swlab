"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson } from "@/lib/api-client";
import type { Episode } from "@/types/episode";

/**
 * エピソード一覧。
 * Firestore を直接購読せず API 越しに取るのは、
 * 承認・編集の結果を1つの経路（PUT → refresh）に集約するため。
 */
async function fetchEpisodes(): Promise<Episode[]> {
  const r = await getJson<{ episodes: Episode[] }>("/api/admin/episodes?status=all");
  return Array.isArray(r.episodes) ? r.episodes : [];
}

function loadError(e: unknown) {
  return e instanceof Error ? e.message : "読み込みに失敗しました";
}

export function useEpisodes(enabled: boolean) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setEpisodes(await fetchEpisodes());
      setError(null);
    } catch (e) {
      setError(loadError(e));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  // 最初の読み込み。loading の初期値が true なので、ここでは結果だけを反映する
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchEpisodes()
      .then((list) => {
        if (!alive) return;
        setEpisodes(list);
        setError(null);
      })
      .catch((e) => alive && setError(loadError(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [enabled]);

  // 無効（管理者でない）あいだは読み込まない。読み込み中とも見せない（以前と同じ）
  return { episodes, loading: enabled && loading, error, refresh };
}
