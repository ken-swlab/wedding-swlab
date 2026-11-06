/**
 * 起動の速さに関わる定数（Issue #250）。
 */

/**
 * LINE のアカウントの確認（hooks/useLineAccountCheck.ts）を始めるまでの待ち時間（ミリ秒）。
 * 最初の画面（投稿・写真）の読み込みと回線を取り合わないよう、少しあとに回す。
 */
export const LINE_CHECK_DELAY_MS = 4000;
