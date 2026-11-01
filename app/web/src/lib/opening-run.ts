/**
 * 招待状のオープニングで「今回」走ったリアクションタイムを、承認待ち（/pending）へ渡す（Issue #199）。
 *
 * ★記録（サーバーに保存した最初の1回）とは別物★ 見返しで2回目を走ると、今回のタイムと記録が食い違う。
 *   承認待ちは記録を大きく出し、違うときだけ今回のタイムを小さく添える。
 * ★メモリにだけ持つ★ 招待状 → 送信完了 → 承認待ちは画面の再読み込みなしでつながる（router.replace）。
 *   再読み込みや /pending を直接開いたときは消えていてよい（そのときは記録だけを出す）。端末には残さない。
 */
let lastRunMs: number | null = null;

/** オープニングが終わったときに呼ぶ。反応なし・スキップは null */
export function rememberOpeningRun(reactionMs: number | null): void {
  lastRunMs = reactionMs;
}

/** 今回のタイム。このタブで招待状のオープニングを走っていなければ null */
export function lastOpeningRun(): number | null {
  return lastRunMs;
}
