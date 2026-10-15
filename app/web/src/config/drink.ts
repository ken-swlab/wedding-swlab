/**
 * 回答フォームの「お酒はどれくらい飲みますか？」（Issue #147）。
 * 値は 0〜4 の整数で、guestPrivate.drinkLevel に保存する（本人と新郎新婦だけが読める）。
 * ★他のゲストに見せない★ 飲まない理由は人それぞれで、健康状態に関わることもある。
 */
export const DRINK_LEVEL_MAX = 4;

/** formLabel はスライダーのメモリの文字（空なら出さない）。label は管理画面・CSV の表記 */
export const DRINK_LEVELS = [
  { value: 0, label: "飲まない",   formLabel: "飲まない" },
  { value: 1, label: "一杯目だけ", formLabel: "一杯目だけ" },
  { value: 2, label: "2",          formLabel: "" },
  { value: 3, label: "3",          formLabel: "" },
  { value: 4, label: "大量",       formLabel: "大量" },
] as const;

export type DrinkLevel = (typeof DRINK_LEVELS)[number]["value"];

export function isDrinkLevel(v: unknown): v is DrinkLevel {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= DRINK_LEVEL_MAX;
}

/**
 * 「大量」を選んだ人に付けるタグ「酒豪」。
 * ★カスタムタグ（tags コレクション）を、コードで決めた固定の ID で作る★
 *   名前・色・投稿の公開範囲で選べるかは、管理画面のタグ管理で新郎新婦が変えられる。
 *   ID は c_ + 8桁の16進数（CUSTOM_TAG_ID_RE）。乱数の採番と重なる確率は無視できる。
 *   作るのはサーバー（lib/drink-tag-server.ts の ensureHeavyDrinkerTag）。
 */
export const HEAVY_DRINKER_TAG = {
  id: "c_5a4e0004",
  label: "酒豪",
  palette: "amber",
} as const;
