import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent, sentryMajorIsSafe } from "@/lib/sentry-scrub";

/**
 * Edge ランタイムの Sentry 初期化
 *   現状 Edge で動くルートは無いが、将来 proxy（旧 middleware）を
 *   足したときに素の設定で動き出さないよう、同じ除去処理を入れておく。
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const version = (Sentry as unknown as { SDK_VERSION?: string }).SDK_VERSION;

if (dsn && sentryMajorIsSafe(version)) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
}
