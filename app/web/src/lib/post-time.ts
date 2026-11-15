/**
 * 投稿・コメントの日時の表示（Issue #301 で1か所にまとめた）。
 *
 * ★新郎新婦の投稿・コメントは時刻を出さず、日付だけ★（Issue #301）いつ起きているか・いつ投稿しているかが分かってしまうため
 *   （推測されやすい情報を画面に出さない。product-decisions.md）。「◯分前」も時刻の手がかりになるので出さない。
 *   dateOnly … 新郎新婦（と、まだ分からない間）。保存する createdAt は変えない（並び順に使う）。管理画面はこれを使わない。
 * ★このファイルは `@/` で値を import しない★（tests/ が Node でそのまま読み込む）
 */

/** 「11/15」（月・日はゼロ埋めしない） */
export function shortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * タイムライン・コメントの短い表示。
 *   ふつう：「たった今」「3分前」「2時間前」、1日を過ぎたら日付（withClock なら「11/15 18:25」。分だけ 2 桁。Issue #79）。
 *   dateOnly：いつでも「11/15」（当日も日付）。
 *   null（送信中）は「送信中…」（本人の画面だけに出る）。
 */
export function relativeTime(d: Date | null, opts: { dateOnly: boolean; withClock: boolean }, now = Date.now()): string {
  if (!d) return "送信中…";
  if (opts.dateOnly) return shortDate(d);
  const min = Math.floor((now - d.getTime()) / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  if (min < 1440) return `${Math.floor(min / 60)}時間前`;
  return opts.withClock ? `${shortDate(d)} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}` : shortDate(d);
}

/** 拡大表示の日時（「11月15日 18:25」。dateOnly なら「11月15日」）。null は空 */
export function fullDate(d: Date | null, dateOnly: boolean): string {
  if (!d) return "";
  return d.toLocaleString("ja-JP", dateOnly
    ? { month: "long", day: "numeric" }
    : { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
