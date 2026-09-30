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
 * どのコミットが本番で動いているかを外から確かめる目印（/api/health の X-Build ヘッダ）。
 *   push したコミットがデプロイされたかを、検証スクリプトが待つのに使う。
 *   値はコミットの短縮 SHA だけで秘密は含まない。/api/health の本文には何も足さない。
 */
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);

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
  /**
   * ★画像最適化（/_next/image）は使わない★
   *   Vercel Hobby の画像最適化は月 5,000 回まで。使い切ると新しい写真が変換されず、
   *   写真の代わりに alt が出る。披露宴当日の投稿量なら届きうる。
   *   R2 の写真は、アップロード時にブラウザで長辺 1920px の JPEG に縮めた版と、
   *   Worker が EXIF を落として公開した原本しかないので、R2 からそのまま配信する。
   *   アイコン（LINE / Google）も直接読み込む（CSP の img-src で許可済み）。
   *
   *   unoptimized だけでは Vercel 側に /_next/image の入口が残ることがある
   *   （nextjs/adapter-vercel #133）。許可先を空にして、外から叩かれても何も変換させない
   *   （他人の画像で月の枠を使い切らせる悪用も防ぐ）。
   *   画像の配信元を足すときは、ここではなく CSP（src/lib/csp.ts）の img-src に足す。
   */
  images: {
    unoptimized: true,
    remotePatterns: [],
    localPatterns: [{ pathname: "/__image-optimizer-disabled__", search: "" }],
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: API_CSP }] },
      { source: "/api/health", headers: [{ key: "X-Build", value: BUILD_ID }] },
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
