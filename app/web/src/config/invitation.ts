/**
 * 招待状（/invitation）の画面の決まりごと。クライアントで使う。
 * ★新郎新婦の名前・会場はここに書かない★ サーバー（src/config/wedding.ts）だけが持つ。
 */

/** ティザー動画を流す上限（秒）。動画が終わらなくても、これを過ぎたら次へ進む */
export const TEASER_MAX_SEC = 15;

/** 動画が無い・再生できないときに、代わりの画面を見せておく長さ（秒） */
export const TEASER_FALLBACK_SEC = 5;
