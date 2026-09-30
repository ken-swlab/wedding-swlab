import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

/**
 * ★本番では Sentry の DSN を必須にする★
 *   NEXT_PUBLIC_ の値はビルド時に、ブラウザ用・サーバー用・proxy 用の JS へ焼き込まれる。
 *   本番のビルド環境に無いと、エラー監視と CSP の報告先がまとめて黙って止まる。
 *   気づかないまま公開しないよう、ここでビルドを失敗させる（Preview とローカルは対象外）。
 */
if (process.env.VERCEL_ENV === "production" && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
  throw new Error("NEXT_PUBLIC_SENTRY_DSN が本番のビルド環境にありません（Sentry と CSP の報告先が無効になります）");
}

/**
 * ★next/image の許可ホスト★
 *
 *   ここはビルド時に解決されるので、環境変数を変えたら再デプロイが要る。
 *   ドメイン移行中は新旧の両方を許可しておく。片方だけにすると、
 *   まだ旧URLを持っている投稿の画像が 400 になる。
 *   旧ドメインを畳んだあとにフォールバックの1行を消す。
 *   （CSP 側の許可ホストは src/lib/csp.ts）
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

/**
 * 強制してよいセキュリティヘッダ。
 *   ページの CSP は Phase 6 で src/proxy.ts へ移した（nonce をリクエストごとに作るため）。
 *   HSTS は Vercel がカスタムドメインに既定で付けるのでここでは付けない。
 *   カメラはファイル選択（<input type="file">）経由でしか使っておらず、
 *   Permissions-Policy の対象外なので camera=() で塞いでも影響しない。
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // 招待制のサイト。検索エンジンやアーカイブに載せない（リンクのプレビューは出る）
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

/**
 * API は JSON と音声しか返さない。万一ブラウザで HTML として開かれても何も実行させない。
 * proxy.ts は /api を通らないので、ここで固定の CSP を付ける。
 */
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

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
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: API_CSP }] },
    ];
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
