import * as Sentry from "@sentry/nextjs";

/**
 * Next.js がサーバー起動時に1回だけ呼ぶ。
 * ランタイムごとに対応する Sentry の初期化ファイルを読み込む。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Server Components / Route Handler から外へ投げられた例外を拾う。
 * 本文やヘッダは sentry.server.config の beforeSend で落とされる。
 */
export const onRequestError = Sentry.captureRequestError;
