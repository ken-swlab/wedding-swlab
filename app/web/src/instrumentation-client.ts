import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent, sentryMajorIsSafe } from "@/lib/sentry-scrub";

/**
 * ブラウザの Sentry 初期化
 *
 * ★Session Replay は入れない★
 *   画面の録画は、マスクされていても「誰がどの写真を見たか」の記録になる。
 *   個人情報を預かるサービスで入れる理由が無い。
 *
 * ★ユーザー情報は付けない★
 *   Sentry.setUser は呼ばない。問い合わせとの突き合わせは
 *   エラー画面に出す requestId と auditLogs で行う。
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const version = (Sentry as unknown as { SDK_VERSION?: string }).SDK_VERSION;

if (dsn && sentryMajorIsSafe(version)) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    ignoreErrors: [
      // ブラウザ側の無害な警告。LINE のアプリ内ブラウザで頻発する
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
