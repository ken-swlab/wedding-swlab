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

/** タイムラインへ引き込む動きの長さ (ms)。0.6〜0.8 秒 */
export const WELCOME_FLY_MS = 700;

/**
 * 写真が出てから、何もせずに待っている人にダブルタップの見本（写真の上で白いハートが一度出て消える）を
 * 見せるまで (ms)。Issue #213（3〜4 秒）。一度だけ。
 */
export const WELCOME_LIKE_HINT_MS = 3500;

/** ハートを見せてから引き込みを始めるまで (ms) */
export const WELCOME_AFTER_LIKE_MS = 650;

/** /admin/welcome（Issue #215）: 写真を選ぶ一覧に出す、新郎新婦の投稿の数（1人あたり、新しい順） */
export const WELCOME_ADMIN_POSTS_PER_AUTHOR = 60;

/** /admin/welcome: couple タグの人を読む上限 */
export const WELCOME_ADMIN_COUPLE_LIMIT = 10;
