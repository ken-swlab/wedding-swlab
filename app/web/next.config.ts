import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

/**
 * ★next/image の許可ホスト★
 *
 *   ここはビルド時に解決されるので、環境変数を変えたら再デプロイが要る。
 *   ドメイン移行中は新旧の両方を許可しておく。片方だけにすると、
 *   まだ旧URLを持っている投稿の画像が 400 になる。
 *   旧ドメインを畳んだあとにフォールバックの1行を消す。
 */
const MEDIA_HOSTS = Array.from(
  new Set(
    [
      process.env.NEXT_PUBLIC_MEDIA_BASE,
      process.env.R2_PUBLIC_BASE,
      "https://wedding-media.sw-lab.net",
      "https://media.wedding.sw-lab.net", // ← 旧ドメイン撤去後に削除する
    ]
      .filter((v): v is string => !!v)
      .map((v) => {
        try {
          return new URL(v).hostname;
        } catch {
          return null;
        }
      })
      .filter((v): v is string => !!v),
  ),
);

/** Sentry の DSN から、CSP 違反レポートの受け口と送信先ホストを組み立てる */
function sentryEndpoints(): { reportUri: string | null; ingestOrigin: string | null } {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return { reportUri: null, ingestOrigin: null };
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, "");
    const key = u.username;
    const origin = `${u.protocol}//${u.host}`;
    if (!projectId || !key) return { reportUri: null, ingestOrigin: origin };
    return { reportUri: `${origin}/api/${projectId}/security/?sentry_key=${key}`, ingestOrigin: origin };
  } catch {
    return { reportUri: null, ingestOrigin: null };
  }
}

const sentry = sentryEndpoints();
const media = MEDIA_HOSTS.map((h) => `https://${h}`);

/**
 * ★CSP はまず Report-Only で入れる★
 *
 *   LIFF・Firebase Auth・R2 への直接アップロード・画像圧縮の Web Worker と、
 *   外部と通信する箇所が多い。いきなり強制すると本番が壊れるので、
 *   違反をブロックせず Sentry に報告させて1〜2週間観察し、
 *   報告が止まったら Content-Security-Policy に切り替える。
 *
 *   script-src の 'unsafe-inline' は Next.js がインラインで埋め込む
 *   スクリプトのため。nonce 化は強制モードへ移すときに検討する。
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  ["img-src 'self' data: blob:", ...media,
    "https://firebasestorage.googleapis.com", "https://storage.googleapis.com",
    "https://lh3.googleusercontent.com", "https://profile.line-scdn.net", "https://obs.line-scdn.net"].join(" "),
  ["media-src 'self' blob:", ...media].join(" "),
  ["connect-src 'self'", ...media,
    "https://*.googleapis.com",
    "https://*.line.me", "https://*.line-scdn.net",
    "https://*.r2.cloudflarestorage.com",
    ...(sentry.ingestOrigin ? [sentry.ingestOrigin] : [])].join(" "),
  "font-src 'self' data:",
  // browser-image-compression は blob: の Web Worker で動く
  "worker-src 'self' blob:",
  "frame-src 'self' https://*.line.me https://*.firebaseapp.com https://*.web.app",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // frame-ancestors は Report-Only では無視される（ブラウザが警告を出すだけ）ので
  // ここには書かない。埋め込み防止は下の X-Frame-Options: DENY が担う。
  // 強制モードへ切り替えるときに frame-ancestors 'none' を足す。
  ...(sentry.reportUri ? [`report-uri ${sentry.reportUri}`] : []),
].join("; ");

/**
 * 強制してよいセキュリティヘッダ。
 *   HSTS は Vercel がカスタムドメインに既定で付けるのでここでは付けない。
 *   カメラはファイル選択（<input type="file">）経由でしか使っておらず、
 *   Permissions-Policy の対象外なので camera=() で塞いでも影響しない。
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...MEDIA_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
      // reference_faces は Firebase Storage に残しているので、以下も必要
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // LINE のプロフィール画像。ここを忘れると全員のアイコンが壊れる
      { protocol: "https", hostname: "profile.line-scdn.net" },
      { protocol: "https", hostname: "obs.line-scdn.net" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

/**
 * ★ソースマップはアップロード後に削除する★
 *   本番のブラウザにソースマップを配らない。Sentry 側でだけ使う。
 *   SENTRY_AUTH_TOKEN が無い環境（ローカル）ではアップロードを飛ばす。
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
