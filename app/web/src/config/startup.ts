/**
 * 起動の速さに関わる定数（Issue #250）。
 */

/**
 * LINE のアカウントの確認（hooks/useLineAccountCheck.ts）を始めるまでの待ち時間（ミリ秒）。
 * 最初の画面（投稿・写真）の読み込みと回線を取り合わないよう、少しあとに回す。
 */
export const LINE_CHECK_DELAY_MS = 4000;

/**
 * ブラウザの Sentry の初期化を、最初の画面のあと（requestIdleCallback）に回すとき、遅くともこの時間で行う (ms)（Issue #277）。
 * それまでのエラーは控えておき、初期化のあとで送る（instrumentation-client.ts）。
 */
export const SENTRY_INIT_TIMEOUT_MS = 2000;

/**
 * 招待状の入口で、LINE の SDK を前もって読み込み・準備（liff.init）しておくまでの待ち (ms)（Issue #277）。
 * 「LINE でログイン」を押した時点で、読み込みと準備を待たないようにする。最初の画面の描画と取り合わないよう、少し待つ。
 */
export const LIFF_WARM_DELAY_MS = 600;
