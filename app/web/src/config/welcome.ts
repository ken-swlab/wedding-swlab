/**
 * 承認後の初回の演出「新郎新婦から、思い出の写真が届きました」（Issue #150）。
 *
 * ★写真はいまは仮の画像★（public/welcome/placeholder.svg。人物や実在の写真は使わない）。
 *   本物は、新郎新婦が実際の投稿として作り、Firestore の config/welcome に「タグ → 投稿 ID」を置く
 *   （lib/welcome-config.ts）。未設定なら仮の画像で演出する。
 */
export const WELCOME_PLACEHOLDER_IMAGE = "/welcome/placeholder.svg";

/** 本文の一言の既定（config/welcome の message が無いとき） */
export const WELCOME_DEFAULT_MESSAGE = "来てくれて、ありがとう";

/** 投稿者の表示 */
export const WELCOME_AUTHOR_NAME = "新郎新婦";

/** ダブルタップが無いまま、この時間がたったら「タップでいいね」を出す (ms) */
export const WELCOME_TAP_HINT_MS = 4000;

/** タイムラインへ引き込む動きの長さ (ms)。0.6〜0.8 秒 */
export const WELCOME_FLY_MS = 700;

/** ハートを見せてから引き込みを始めるまで (ms) */
export const WELCOME_AFTER_LIKE_MS = 650;
