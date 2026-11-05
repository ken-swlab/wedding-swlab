/**
 * 先読み（Issue #255）。スクロールの少し先の写真と、よく開く画面を、手が空いているときに読んでおく。
 *
 * ★電波が悪いときは控えめにする★（isSlowConnection）
 *   navigator.connection.saveData が真、または effectiveType が 2g / slow-2g のとき。
 *   navigator.connection が無い端末（iOS の Safari・LINE など）では、悪くないものとして扱う。
 * ★全画面の写真（軽量版・原本）は先読みしない★ 重いので、押したときだけ読む。
 * ★このファイルは `@/` で値を import しない★（tests/ が Node でそのまま読み込む）
 */

/** タイムラインで、見えている投稿の次に先読みする投稿の数（ふつう / 電波が悪いとき） */
export const PREFETCH_TIMELINE_POSTS = 3;
export const PREFETCH_TIMELINE_POSTS_SLOW = 1;
/** ギャラリーで、見えている格子の次に先読みする画面の数（ふつうは1画面。電波が悪いときは1枚だけ） */
export const PREFETCH_GALLERY_SCREENS = 1;
export const PREFETCH_GALLERY_TILES_SLOW = 1;
/** タイムラインを開いて落ち着いてから、画面の先読みを始めるまで（requestIdleCallback が無いとき） */
export const PREFETCH_IDLE_FALLBACK_MS = 2000;
/** ギャラリーの最初の何枚分の投稿を、タイムラインのうちに読んでおくか（ギャラリーの最初の読み込みと同じ） */
export const PREFETCH_GALLERY_FIRST_TILES = 30;

type ConnectionLike = { saveData?: boolean; effectiveType?: string } | undefined | null;

/** 電波が悪い（か、通信を節約したい）か。分からなければ false */
export function isSlowConnection(conn: ConnectionLike): boolean {
  if (!conn) return false;
  if (conn.saveData === true) return true;
  return conn.effectiveType === "2g" || conn.effectiveType === "slow-2g";
}

/** いまの端末の回線（ブラウザの外では undefined） */
export function currentConnection(): ConnectionLike {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: ConnectionLike }).connection;
}

/** タイムラインで先読みする投稿の数 */
export function timelinePrefetchCount(conn: ConnectionLike): number {
  return isSlowConnection(conn) ? PREFETCH_TIMELINE_POSTS_SLOW : PREFETCH_TIMELINE_POSTS;
}

/** ギャラリーで先読みする格子の数（1画面分 = 画面の高さに入る行 × 列） */
export function galleryPrefetchCount(conn: ConnectionLike, viewport: { width: number; height: number }, columns: number): number {
  if (isSlowConnection(conn)) return PREFETCH_GALLERY_TILES_SLOW;
  const tile = Math.max(1, viewport.width / columns);
  return Math.ceil(viewport.height / tile) * columns * PREFETCH_GALLERY_SCREENS;
}

/** 見えているものの一番後ろの次から count 件（範囲の外は詰める） */
export function nextRange<T>(list: readonly T[], lastVisible: number, count: number): T[] {
  if (lastVisible < 0 || count <= 0) return [];
  return list.slice(lastVisible + 1, lastVisible + 1 + count);
}

const requested = new Set<string>();

/**
 * 写真を先に読んでおく（ブラウザのキャッシュに入れる）。同じ URL は1回だけ。
 * ★端末の中の写真（blob:）・data URL は読まない★（通信しない。送信中の投稿・下絵）
 */
export function prefetchImage(src: string | null | undefined): void {
  if (!src || typeof window === "undefined") return;
  if (src.startsWith("blob:") || src.startsWith("data:") || requested.has(src)) return;
  requested.add(src);
  const img = new window.Image();
  img.decoding = "async";
  img.src = src;
}

/** 手が空いたときに一度だけ呼ぶ。戻り値で取り消す */
export function whenIdle(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: PREFETCH_IDLE_FALLBACK_MS * 2 });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(fn, PREFETCH_IDLE_FALLBACK_MS);
  return () => window.clearTimeout(t);
}
