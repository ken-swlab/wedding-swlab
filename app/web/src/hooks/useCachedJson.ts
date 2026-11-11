"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/lib/api-client";
import { onInvalidate, readCache, writeCache } from "@/lib/client-cache";

export type CachedJson<T> = {
  /** 表示する値（前回の結果か、読み直した最新）。まだ無ければ undefined */
  data: T | undefined;
  /** 前回の結果が無く、読めなかったときだけ */
  error: string | null;
};

type Fetched<T> = { key: string; data?: T; error?: string };

/**
 * 読んでいる途中の呼び出し（種類・パラメータ・パスごと）。★同じものを読んでいる間は、もう1回呼ばない★
 * 先読みのあとに画面を開いたとき・開発時の effect の二重実行でも、API は1本になる。
 * invalidateCache で捨てられたら、途中のものも使わない（捨てる前の古い結果を返さない）。
 */
const inflight = new Map<string, { kind: string; p: Promise<unknown> }>();
const watchedKinds = new Set<string>();

function load<T>(kind: string, key: string, path: string): Promise<T> {
  if (!watchedKinds.has(kind)) {
    watchedKinds.add(kind);
    onInvalidate(kind, () => {
      for (const [k, v] of inflight) if (v.kind === kind) inflight.delete(k);
    });
  }
  const hit = inflight.get(key);
  if (hit) return hit.p as Promise<T>;
  const p = getJson<T>(path).finally(() => {
    if (inflight.get(key)?.p === p) inflight.delete(key);
  });
  inflight.set(key, { kind, p });
  return p;
}

/**
 * 前回の結果をすぐ出し、裏で必ず読み直して差し替える（stale-while-revalidate。Issue #286）。
 * コミュニティ（種類 "community"・パラメータはタグ）と会費（"payment"）で使う。
 *
 * ★前回の結果は同じ uid のものだけ★（lib/client-cache.ts）
 * ★読み直しに失敗したら、前回の結果を出したまま★ 前回が無いときだけ error を返す。
 * ★cache: false は保存も読み出しもしない★（管理者のプレビューなど、本人の本当の値ではないもの）
 * ★invalidateCache(種類) で捨てられたら、開いている画面は読み直す★
 */
export function useCachedJson<T>(
  uid: string | undefined,
  kind: string,
  param: string | null,
  path: string,
  options: { cache?: boolean } = {},
): CachedJson<T> {
  const useCache = options.cache !== false;
  const key = uid && param !== null ? `${uid}\n${kind}\n${param}\n${path}` : null;
  const [fetched, setFetched] = useState<Fetched<T> | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => onInvalidate(kind, () => setVersion((v) => v + 1)), [kind]);

  useEffect(() => {
    if (!key || !uid || param === null) return;
    let cancelled = false;
    load<T>(kind, key, path)
      .then((data) => {
        if (cancelled) return;
        if (useCache) writeCache(uid, kind, param, data);
        setFetched({ key, data });
      })
      .catch((e: unknown) => {
        if (!cancelled) setFetched({ key, error: e instanceof Error ? e.message : "読み込みに失敗しました" });
      });
    return () => {
      cancelled = true;
    };
  }, [key, uid, kind, param, path, useCache, version]);

  if (!key || !uid || param === null) return { data: undefined, error: null };
  const mine = fetched?.key === key ? fetched : null;
  if (mine?.data !== undefined) return { data: mine.data, error: null };
  const cached = useCache ? readCache<T>(uid, kind, param) : undefined;
  if (cached !== undefined) return { data: cached, error: null };
  return { data: undefined, error: mine?.error ?? null };
}

/** 先読み（結果をキャッシュに入れるだけ。失敗しても何もしない。画面がすぐ開けば、同じ呼び出しを待つ） */
export function prefetchCachedJson(uid: string, kind: string, param: string, path: string): void {
  load<unknown>(kind, `${uid}\n${kind}\n${param}\n${path}`, path)
    .then((data) => writeCache(uid, kind, param, data))
    .catch(() => {});
}
