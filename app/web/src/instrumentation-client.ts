// ★名前を付けて import する★（Issue #250）`import * as Sentry` だと使っていない部品（Session Replay・Feedback など）まで
//   最初の JS に入る。使うものだけを書く
import { captureRouterTransitionStart, init, SDK_VERSION } from "@sentry/nextjs";
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
const version: string | undefined = SDK_VERSION;

if (dsn && sentryMajorIsSafe(version)) {
  init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    /**
     * ★ページの読み込みの速さ（Web Vitals: LCP・INP・CLS など）を 10% の訪問で集める★（Issue #250）
     *   ページの読み込みの記録（pageload）に Web Vitals が付く。送る前に beforeSendTransaction（scrubEvent）が
     *   URL のクエリ・ユーザー・追加の情報を消す（スパンの URL のクエリも消す。lib/sentry-scrub.ts）。
     */
    tracesSampleRate: 0.1,
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

export const onRouterTransitionStart = captureRouterTransitionStart;
