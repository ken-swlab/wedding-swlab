/**
 * リアクションタイムのランキングの並べ方（Issue #132）。
 *
 * ★このファイルは他のファイルを import しない★ tests/reaction-ranking.test.mjs が Node でそのまま読み込む。
 * ★順位は表示と同じ 1/100 秒（切り捨て）で決める★ 0.251 秒と 0.259 秒はどちらも「0.25」なので同じ順位。
 *   同じ順位のあとは、その人数ぶん飛ばす（1位・1位・3位）。
 */

export type RankingEntry = { reactionMs: number; recordedAtMs: number };
export type Ranked<T> = T & { rank: number };

/** 表示と同じ単位（1/100 秒・切り捨て） */
function hundredths(reactionMs: number): number {
  return Math.floor(reactionMs / 10);
}

/** 速い順に並べ、順位を付ける。同じ 1/100 秒の中は、先に記録した人を上にする（順位は同じ） */
export function rankEntries<T extends RankingEntry>(entries: readonly T[]): Ranked<T>[] {
  const sorted = [...entries].sort(
    (a, b) => hundredths(a.reactionMs) - hundredths(b.reactionMs) || a.recordedAtMs - b.recordedAtMs,
  );
  const out: Ranked<T>[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const prev = out[i - 1];
    const tie = prev !== undefined && hundredths(prev.reactionMs) === hundredths(sorted[i].reactionMs);
    out.push({ ...sorted[i], rank: tie ? prev.rank : i + 1 });
  }
  return out;
}
