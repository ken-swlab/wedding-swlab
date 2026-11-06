import { COUPLE_TAG } from "../config/tags.ts";

/**
 * 投稿画面の公開範囲の選び方（Issue #272）。
 *
 *   - 個別のタグを選んだら「全員」を外す
 *   - 「全員」を選んだら、個別のタグをすべて外す（すでに「全員」だけなら、そのまま）
 *   - 個別のタグを全部外したら、自動で「全員」に戻る（公開範囲が空にならない）
 *   - 「新郎新婦」は今までどおり単独でだけ選べる（選ぶとほかが外れ、ほかを選ぶと外れる。Issue #97）。外したら「全員」に戻る
 *
 * canAll … 自分が「全員」を選べるか（タグ all を持っているか）。持っていなければ「全員」に戻さず空にする
 *   （投稿画面は「公開範囲を1つ以上選んでください」と出す。今までと同じ）。
 * ★このファイルは `@/` で値を import しない★（tests/ が Node でそのまま読み込む）
 */
export const ALL_TAG = "all";

export function toggleScope(selected: readonly string[], id: string, canAll: boolean): string[] {
  const fallback = canAll ? [ALL_TAG] : [];
  if (id === ALL_TAG) return canAll ? [ALL_TAG] : [...selected];
  if (id === COUPLE_TAG) return selected.includes(COUPLE_TAG) ? fallback : [COUPLE_TAG];
  const rest = selected.filter((x) => x !== COUPLE_TAG && x !== ALL_TAG);
  const next = rest.includes(id) ? rest.filter((x) => x !== id) : [...rest, id];
  return next.length > 0 ? next : fallback;
}

/**
 * 1行の表示（「公開範囲　はまっこ・東部水泳 ›」）と、編集画面の表示に使う並び。
 * ★個別のタグがあれば「全員」は出さない★（以前の投稿で、全員と個別のタグが両方入っているもの）。見える人は変わらない
 *   （all を持つ人は全員なので、見える人は「全員」と同じ。表示だけを決まりに合わせる）。
 */
export function scopeForDisplay(ids: readonly string[]): string[] {
  const specific = ids.filter((x) => x !== ALL_TAG);
  return specific.length > 0 && ids.includes(ALL_TAG) ? specific : [...ids];
}
