/**
 * サーバーの中で、集計の結果を短い時間だけ使い回す（Issue #286）。
 *
 *   memo(key, ttlMs, fn) … 同じ key で ttlMs 以内なら、前回の結果を返す。
 *
 * ★同時に来た呼び出しは、実行中の1回を使い回す★（同じ集計を同時に何本も走らせない）
 * ★失敗した結果は保存しない★ 次の呼び出しで、もう一度読み直す。
 * ★置き場所は、このサーバー（Vercel のインスタンス）のメモリだけ★ Firestore への書き込みは増やさない。
 *   インスタンスが違えば、それぞれで集計する。
 * ★アクセス権の確認は、使い回しの前に毎回、呼び出し側で行う★ ここに入れるのは、全員に共通の部分だけ
 *   （自分の行・伏せる処理など、人によって変わる部分は入れない）。
 * ★このファイルは `@/` で値を import しない★（tests/ が Node でそのまま読み込む）
 */
type Entry = { at: number; value: unknown };

const done = new Map<string, Entry>();
const running = new Map<string, Promise<unknown>>();

/** 数えたもの（テストとログ用）: 実際に fn を動かした回数 */
let runs = 0;
export function memoRuns(): number {
  return runs;
}

export async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  const hit = done.get(key);
  if (hit && now() - hit.at < ttlMs) return hit.value as T;
  const inFlight = running.get(key);
  if (inFlight) return inFlight as Promise<T>;
  runs += 1;
  const p = fn()
    .then((value) => {
      done.set(key, { at: now(), value });
      return value;
    })
    .finally(() => {
      running.delete(key);
    });
  running.set(key, p);
  return p;
}

/** 使い回しを捨てる（key を指定しなければ全部。テストと、書き込みの直後に使う） */
export function forget(key?: string) {
  if (key === undefined) done.clear();
  else done.delete(key);
}
