/**
 * 前回の結果をすぐ出すための、画面側のキャッシュ（Issue #286。hooks/useCachedJson.ts が使う）。
 *
 * 置き場所はメモリと localStorage。キーは `cache:v1:{uid}:{種類}:{パラメータ}`。
 * ★uid が違うデータは絶対に使わない★ キーに uid を入れたうえで、持ち主（`cache:v1:owner`）が変わったら
 *   `cache:v1:` で始まるものを全部消す。サインアウト（lib/firebase.ts の clearDeviceData）でも全部消す。
 * ★読み書きはすべて try/catch★ プライベートブラウズなどで localStorage が使えなくても、メモリだけで動く（開き直すと毎回読むだけ）。
 * ★種類ごとに CACHE_MAX_PER_KIND 件まで★ 古いものから消す（1件は数KB）。
 * ★中身は画面に出してよいものだけ★（API がその人に返した応答そのもの。ニックネーム・アイコン・順位・タイム・会費の内訳）
 *
 * ★@/ で値を import しない★（tests/client-cache.test.mjs が node --test で読む）
 */
export const CACHE_PREFIX = "cache:v1:";
const OWNER_KEY = `${CACHE_PREFIX}owner`;
export const CACHE_MAX_PER_KIND = 8;

type Stored = { at: number; v: unknown };

const memory = new Map<string, Stored>();
let owner: string | null = null;
const listeners = new Map<string, Set<() => void>>();

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** `cache:v1:` で始まる localStorage のキー */
function storedKeys(): string[] {
  const s = storage();
  if (!s) return [];
  try {
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) out.push(k);
    }
    return out;
  } catch {
    return [];
  }
}

export function cacheKey(uid: string, kind: string, param: string): string {
  return `${CACHE_PREFIX}${uid}:${kind}:${param}`;
}

/** 端末のキャッシュを全部消す（サインアウト・持ち主が変わったとき） */
export function clearClientCache(): void {
  memory.clear();
  const s = storage();
  for (const k of storedKeys()) {
    try {
      s?.removeItem(k);
    } catch {
      /* 消せなくても続ける */
    }
  }
  owner = null;
}

/** ★持ち主（uid）が変わっていたら、まず全部消す★ */
function ensureOwner(uid: string): void {
  if (owner === uid) return;
  const s = storage();
  let saved: string | null = null;
  try {
    saved = s?.getItem(OWNER_KEY) ?? null;
  } catch {
    saved = null;
  }
  if (saved !== uid || (owner !== null && owner !== uid)) {
    clearClientCache();
    try {
      s?.setItem(OWNER_KEY, uid);
    } catch {
      /* 書けなくても続ける（メモリだけで動く） */
    }
  }
  owner = uid;
}

export function readCache<T>(uid: string, kind: string, param: string): T | undefined {
  ensureOwner(uid);
  const key = cacheKey(uid, kind, param);
  const hit = memory.get(key);
  if (hit) return hit.v as T;
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (typeof parsed.at !== "number" || !("v" in parsed)) return undefined;
    memory.set(key, { at: parsed.at, v: parsed.v });
    return parsed.v as T;
  } catch {
    return undefined;
  }
}

export function writeCache(uid: string, kind: string, param: string, value: unknown, now: number = Date.now()): void {
  ensureOwner(uid);
  const key = cacheKey(uid, kind, param);
  const entry: Stored = { at: now, v: value };
  memory.set(key, entry);
  const s = storage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(entry));
  } catch {
    /* いっぱい・使えないときはメモリだけ */
  }
  // 種類ごとの件数を抑える（古いものから消す）
  const prefix = `${CACHE_PREFIX}${uid}:${kind}:`;
  const same = storedKeys()
    .filter((k) => k.startsWith(prefix))
    .map((k) => {
      try {
        const at = (JSON.parse(s.getItem(k) ?? "{}") as Partial<Stored>).at;
        return { k, at: typeof at === "number" ? at : 0 };
      } catch {
        return { k, at: 0 };
      }
    })
    .sort((a, b) => b.at - a.at);
  for (const { k } of same.slice(CACHE_MAX_PER_KIND)) {
    try {
      s.removeItem(k);
    } catch {
      /* 続ける */
    }
    memory.delete(k);
  }
}

/**
 * ある種類のキャッシュを捨て、開いている画面に読み直させる（自分の記録を送った直後・出欠を変えたあとなど）。
 * 持ち主に関係なく、その種類を全部捨てる。
 */
export function invalidateCache(kind: string): void {
  const mark = `:${kind}:`;
  for (const k of [...memory.keys()]) if (k.includes(mark)) memory.delete(k);
  const s = storage();
  for (const k of storedKeys()) {
    if (k === OWNER_KEY || !k.slice(CACHE_PREFIX.length).includes(mark)) continue;
    try {
      s?.removeItem(k);
    } catch {
      /* 続ける */
    }
  }
  for (const cb of listeners.get(kind) ?? []) cb();
}

/** invalidateCache を聞く（useCachedJson が読み直すため） */
export function onInvalidate(kind: string, cb: () => void): () => void {
  let set = listeners.get(kind);
  if (!set) listeners.set(kind, (set = new Set()));
  set.add(cb);
  return () => {
    set.delete(cb);
  };
}

/** テスト用: メモリの状態を初めに戻す */
export function resetClientCacheMemory(): void {
  memory.clear();
  owner = null;
  listeners.clear();
}
