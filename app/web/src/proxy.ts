import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, cspEnforced } from "@/lib/csp";

/**
 * ★Phase 6: ページのリクエストごとに nonce を作り、CSP を付ける★
 *
 *   1. ここで乱数の nonce を作り、リクエストヘッダの Content-Security-Policy に入れる
 *   2. Next.js は SSR の途中でそのヘッダから nonce を読み、自分が出す <script> に付ける
 *   3. ブラウザへ返すヘッダは lib/csp.ts の CSP_MODE で強制か Report-Only かを決める
 *
 *   nonce を付けられるのはリクエスト時に描画したページだけなので、
 *   ルートレイアウトで connection() を待たせて全ページを動的レンダリングにしている。
 *
 * ★これは認証の境界ではない★
 *   ページの HTML は従来どおり誰にでも返る。守りは Firestore Rules と
 *   各 Route Handler の verifyIdToken が担う。/api はここを通らない。
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const enforce = cspEnforced();
  const policy = buildCsp(nonce, { enforce, dev: process.env.NODE_ENV === "development" });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(
    enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    policy,
  );
  return response;
}

/** 128bit の乱数を base64 にする。推測されない値であればよい */
function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * 対象はページだけ。API・静的ファイル・画像最適化・自前配信のライブラリ・
 * next/link のプリフェッチは通さない（CSP が要らず、呼び出し回数だけ増える）。
 */
export const config = {
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|favicon.ico|vendor/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
