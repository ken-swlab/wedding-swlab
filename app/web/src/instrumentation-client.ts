// ★名前を付けて import する★（Issue #250）`import * as Sentry` だと使っていない部品（Session Replay・Feedback など）まで
//   最初の JS に入る。使うものだけを書く
import { captureException, captureRouterTransitionStart, init, SDK_VERSION } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent, sentryMajorIsSafe } from "@/lib/sentry-scrub";
import { bootMark } from "@/lib/boot-timing";
import { markSentryReady } from "@/lib/sentry-ready";
import { SENTRY_INIT_TIMEOUT_MS } from "@/config/startup";

// 起動の計測: アプリの JS が動き始めた（Issue #277。lib/boot-timing.ts）
bootMark("js");

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

/**
 * ★初期化は、最初の画面が出たあと（ブラウザの手が空いたとき）に行う★（Issue #277）
 *   起動の一番忙しいときに Sentry の準備（計測の部品の取り付けなど）をしない。遅くとも SENTRY_INIT_TIMEOUT_MS で行う。
 * ★それまでのエラーは取りこぼさない★ 初期化の前に起きたエラー（error・unhandledrejection）を控えておき、
 *   初期化したあとで送る。ページの読み込みの記録（Web Vitals）は、初期化のときにページを開いた時刻から作られる。
 */
const early: unknown[] = [];
const onEarlyError = (e: ErrorEvent) => {
  if (early.length < 20) early.push(e.error ?? new Error(e.message));
};
const onEarlyRejection = (e: PromiseRejectionEvent) => {
  if (early.length < 20) early.push(e.reason);
};

function startSentry() {
  window.removeEventListener("error", onEarlyError);
  window.removeEventListener("unhandledrejection", onEarlyRejection);
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
  for (const e of early.splice(0)) captureException(e);
  markSentryReady();
}

if (typeof window !== "undefined" && dsn && sentryMajorIsSafe(version)) {
  window.addEventListener("error", onEarlyError);
  window.addEventListener("unhandledrejection", onEarlyRejection);
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(startSentry, { timeout: SENTRY_INIT_TIMEOUT_MS });
  else window.setTimeout(startSentry, 1);
}

export const onRouterTransitionStart = captureRouterTransitionStart;
