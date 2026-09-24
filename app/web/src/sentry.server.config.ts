import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent, sentryMajorIsSafe } from "@/lib/sentry-scrub";

/**
 * サーバー（Node.js ランタイム）の Sentry 初期化
 *
 * captureConsoleIntegration(["error"]):
 *   各ルートは例外を自前で catch して console.error してから 500 を返す。
 *   そのままだと Sentry に届かないので、console.error をイベントとして拾う。
 *   route-guard が Sentry の isolation scope に route / request_id タグを
 *   付けているので、どの API のどのリクエストかが分かる。
 *   warn / log は拾わない（パスコード不一致などの想定内の警告で溢れるため）。
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const version = (Sentry as unknown as { SDK_VERSION?: string }).SDK_VERSION;

if (!dsn) {
  // 未設定なら何もしない（ローカル開発など）
} else if (!sentryMajorIsSafe(version)) {
  console.warn(
    `[sentry] @sentry/nextjs ${version ?? "(不明)"} は既定で個人情報を送信する版の可能性があるため初期化しません。` +
      " v11 以降に上げる場合は dataCollection の設定を見直してから sentry-scrub.ts の判定を更新してください",
  );
} else {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    includeLocalVariables: false,
    tracesSampleRate: 0.1,
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
}
