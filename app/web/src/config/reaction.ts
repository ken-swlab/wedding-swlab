/**
 * リアクションタイムのランキング（Issue #132）の決まりごと。クライアントとサーバーの両方で使う。
 * 計測と記録の決まりごと（範囲・タイミング）は src/config/opening.ts。
 */

/** ランキングに出す件数（上位）。自分が圏外でも、自分の行は別に出す */
export const RANKING_TOP = 50;

/** 1つのタグで読むゲストの上限（サーバーの集計）。1つの式の人数を十分に超える値 */
export const RANKING_GUEST_LIMIT = 500;

/** 「全員」のタグ。タグの切り替えの先頭に置く */
export const RANKING_ALL_TAG = "all";
