/**
 * Content-Security-Policy の組み立て（src/proxy.ts から使う）
 *
 * ★script-src は nonce + 'strict-dynamic'★
 *   動くのは、nonce の付いたスクリプト（Next.js が出力するもの）と、
 *   それが後から読み込んだスクリプト（チャンク、Firebase Auth の gapi など）だけ。
 *   HTML に差し込まれた <script>（XSS）は nonce を知らないので動かない。
 *   'self' と 'unsafe-inline' は strict-dynamic を知らない古いブラウザ向けの保険。
 *   新しいブラウザは nonce があると 'unsafe-inline' を無視する。
 *
 * ★style-src には nonce を入れない★
 *   nonce を入れると 'unsafe-inline' が無効になり、React が SSR で出す
 *   style="..." 属性と framer-motion のスタイルがすべて止まる。
 *
 * ★ホストを足すときは Report-Only で確かめてから★
 *   下の CSP_MODE が "report-only" の間は、違反してもブロックせず Sentry へ報告するだけ。
 */

/** 旧メディアドメイン。撤去したらこの行ごと消す */
const LEGACY_MEDIA_ORIGIN = "https://media.wedding.sw-lab.net";

type Fixed = {
  media: string[];
  sentryIngest: string | null;
  reportUri: string | null;
};

let fixed: Fixed | null = null;

function httpsOrigin(v: string | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** 環境変数から決まる部分。リクエストごとに組み立て直さない */
function fixedParts(): Fixed {
  if (fixed) return fixed;

  const media = Array.from(
    new Set(
      [
        process.env.NEXT_PUBLIC_MEDIA_BASE,
        process.env.R2_PUBLIC_BASE,
        "https://wedding-media.sw-lab.net",
        LEGACY_MEDIA_ORIGIN,
      ]
        .map(httpsOrigin)
        .filter((v): v is string => !!v),
    ),
  );

  let sentryIngest: string | null = null;
  let reportUri: string | null = null;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) {
    try {
      const u = new URL(dsn);
      const projectId = u.pathname.replace(/^\/+|\/+$/g, "");
      sentryIngest = `${u.protocol}//${u.host}`;
      if (projectId && u.username) {
        // 環境名を付けておくと、Preview からの報告を Sentry 上で分けられる
        const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
        reportUri =
          `${sentryIngest}/api/${projectId}/security/` +
          `?sentry_key=${encodeURIComponent(u.username)}&sentry_environment=${encodeURIComponent(env)}`;
      }
    } catch {
      /* DSN が壊れていても CSP 自体は出す（報告先が無いだけ） */
    }
  }

  fixed = { media, sentryIngest, reportUri };
  return fixed;
}

/**
 * ★強制するかどうかはここで切り替える★
 *   "report-only": 違反してもブロックせず、Sentry へ報告するだけ
 *   "enforce"    : ブラウザが違反をブロックする
 *   環境変数ではなくコードに置き、切り替えをコミットとして残す
 *   （いつから強制したかを履歴で追え、戻すときも git revert で済む）。
 */
// 2026-10: Issue #9 のオーナー指示で強制に切り替えた。戻すときはこの行を "report-only" にする
export const CSP_MODE: "report-only" | "enforce" = "enforce";

export function cspEnforced(): boolean {
  return CSP_MODE === "enforce";
}

export function buildCsp(nonce: string, opts: { enforce: boolean; dev: boolean }): string {
  const { media, sentryIngest, reportUri } = fixedParts();

  const directives = [
    "default-src 'self'",
    // 開発サーバーは React がデバッグ用に eval を使う。本番では付けない
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    [
      "img-src 'self' data: blob:",
      ...media,
      "https://firebasestorage.googleapis.com",
      "https://storage.googleapis.com",
      "https://lh3.googleusercontent.com",
      "https://profile.line-scdn.net",
      "https://obs.line-scdn.net",
    ].join(" "),
    // data: は管理画面の unlockAudio（無音 WAV）のため
    ["media-src 'self' data: blob:", ...media].join(" "),
    [
      "connect-src 'self'",
      ...media,
      "https://*.googleapis.com",
      "https://*.line.me",
      "https://*.line-scdn.net",
      "https://*.r2.cloudflarestorage.com",
      ...(sentryIngest ? [sentryIngest] : []),
    ].join(" "),
    "font-src 'self' data:",
    // browser-image-compression は blob: の Web Worker で動く
    "worker-src 'self' blob:",
    "frame-src 'self' https://*.line.me https://*.firebaseapp.com https://*.web.app",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ];

  // どちらも Report-Only では無視され、ブラウザが警告を出すだけなので強制時にだけ付ける
  if (opts.enforce) directives.push("frame-ancestors 'none'", "upgrade-insecure-requests");
  if (reportUri) directives.push(`report-uri ${reportUri}`);

  return directives.join("; ");
}
