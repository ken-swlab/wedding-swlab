/**
 * 招待状のパスコード入力の決まりごと。クライアントとサーバーで共有する。
 * ★パスコードそのものはここに書かない★ サーバーの WEDDING_PASSCODE だけが持つ。
 */

/**
 * 桁数。画面はこの桁数を入れた瞬間に自動で送信する。
 * ★WEDDING_PASSCODE の桁数と必ず一致させる★
 *   食い違うと「何を入れても送信されない／必ず違う」になる。
 *   サーバーは一致しないとき 503 を返し、console.error で知らせる。
 */
export const PASSCODE_LENGTH = 4;

/** 連続で間違えられる回数。超えると UID ごとにロックする */
export const PASSCODE_MAX_ATTEMPTS = 5;

/** ロックの長さ（分） */
export const PASSCODE_LOCK_MINUTES = 30;
