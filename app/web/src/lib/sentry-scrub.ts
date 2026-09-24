/**
 * Sentry に送る前の個人情報の除去（サーバー・Edge・ブラウザ共通）
 *
 * ★SDK の既定値に頼らない★
 *   @sentry/nextjs は v11 で「未設定なら全部集める」に既定が変わる
 *   （リクエスト本文・ヘッダ・IP・ユーザー情報）。本文には本名・
 *   アレルギー・パスコードが入り、ヘッダには Firebase の ID トークンが
 *   入る。SDK のバージョンに関係なく、ここで必ず落とす。
 *
 * ★ID は Sentry に渡さない★
 *   誰のエラーかは requestId タグ → auditLogs で自前の Firestore 側で
 *   突き合わせる。Sentry（米国の第三者）には本人を特定できる値を渡さない。
 *
 * このファイルは Node 専用 API を使わない（ブラウザでも読み込まれる）。
 */

const PATTERNS: [RegExp, string][] = [
  // Firebase ID トークン・任意の JWT
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[jwt]"],
  // LINE の uid（Firebase 側では line:U... という形）
  [/line:U[0-9a-f]{32}/gi, "[line-uid]"],
  [/\bU[0-9a-f]{32}\b/g, "[line-uid]"],
  // 仮登録の uid
  [/\bpre_[A-Za-z0-9_-]{6,}/g, "[pre-uid]"],
  // メールアドレス
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  // 署名付き URL の署名部分
  [/(X-Amz-(?:Signature|Credential|Security-Token))=[^&\s"']+/gi, "$1=[redacted]"],
  // R2 のオブジェクトキーに入っている uid
  [/\bu\/[^/\s"']+\/(t|o)\//g, "u/[uid]/$1/"],
];

export function redact(s: string): string {
  let out = s;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

function stripQuery(url: string): string {
  const i = url.search(/[?#]/);
  return redact(i >= 0 ? url.slice(0, i) : url);
}

type Req = {
  url?: string;
  query_string?: unknown;
  data?: unknown;
  cookies?: unknown;
  headers?: Record<string, string>;
  env?: unknown;
};

type Crumb = {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
};

type Evt = {
  request?: Req;
  user?: unknown;
  message?: string;
  logentry?: { message?: string; params?: unknown };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: Crumb[];
  extra?: unknown;
  transaction?: string;
};

/** 残してよいヘッダ。それ以外（Authorization・Cookie・x-forwarded-for など）は捨てる */
const SAFE_HEADERS = new Set(["content-type", "content-length", "accept"]);

export function scrubBreadcrumb<T extends object>(crumb: T): T | null {
  const c = crumb as Crumb;
  // console の中身は何が出ているか分からないので丸ごと捨てる
  if (c.category === "console") return null;
  if (typeof c.message === "string") c.message = redact(c.message);
  if (c.data) {
    for (const k of ["body", "request_body", "response_body", "input", "arguments"]) delete c.data[k];
    if (typeof c.data.url === "string") c.data.url = stripQuery(c.data.url);
    if (typeof c.data.to === "string") c.data.to = stripQuery(c.data.to);
    if (typeof c.data.from === "string") c.data.from = stripQuery(c.data.from);
  }
  return crumb;
}

export function scrubEvent<T extends object>(event: T): T {
  const e = event as Evt;

  if (e.request) {
    delete e.request.data;
    delete e.request.cookies;
    delete e.request.query_string;
    delete e.request.env;
    if (typeof e.request.url === "string") e.request.url = stripQuery(e.request.url);
    if (e.request.headers) {
      const kept: Record<string, string> = {};
      for (const [k, v] of Object.entries(e.request.headers)) {
        if (SAFE_HEADERS.has(k.toLowerCase())) kept[k] = v;
      }
      e.request.headers = kept;
    }
  }

  delete e.user;
  delete e.extra;

  if (typeof e.message === "string") e.message = redact(e.message);
  if (e.logentry && typeof e.logentry.message === "string") e.logentry.message = redact(e.logentry.message);
  if (e.logentry) delete e.logentry.params;
  for (const v of e.exception?.values ?? []) {
    if (typeof v.value === "string") v.value = redact(v.value);
  }
  if (typeof e.transaction === "string") e.transaction = stripQuery(e.transaction);
  if (Array.isArray(e.breadcrumbs)) {
    e.breadcrumbs = e.breadcrumbs.map((b) => scrubBreadcrumb(b)).filter((b): b is Crumb => b !== null);
  }
  return event;
}

/**
 * v11 以降は既定値が「全部集める」に変わる。設定を見直さないまま
 * 上げてしまった場合に、黙って個人情報を送り始めないよう初期化を止める。
 */
export function sentryMajorIsSafe(version: string | undefined): boolean {
  const major = Number(String(version ?? "0").split(".")[0]);
  return Number.isFinite(major) && major > 0 && major < 11;
}
