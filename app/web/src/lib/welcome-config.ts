/**
 * Firestore の config/welcome の形の確認（Issue #150）。クライアントからは読み書きできない（Rules の既定の拒否）。
 *
 *   {
 *     defaultPostId: "…",                    // 全員向けの投稿（任意）
 *     byTag: { "friends_groom": "…", … },   // タグ → 投稿 ID（任意）
 *     message: "来てくれて、ありがとう",       // 本文の一言の既定（任意）
 *     messages: { "c_xxxxxxxx": "〇〇大水泳部のみんなへ" } // タグごとの一言（任意）
 *   }
 *
 * ★このファイルは `@/` で値を import しない★（tests/ が Node でそのまま読み込む）
 * ★値をログやエラーに出さない★ 返すのは、だめだった項目の名前だけ。
 */
export type WelcomeConfig = {
  defaultPostId: string;
  byTag: Record<string, string>;
  message: string;
  messages: Record<string, string>;
};

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TAG_RE = /^[A-Za-z0-9_]{1,40}$/;
const MAX_MESSAGE = 60;
const MAX_ENTRIES = 50;

function map(v: unknown, valueOk: (s: string) => boolean): Record<string, string> | null {
  if (v === undefined) return {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length > MAX_ENTRIES) return null;
  const out: Record<string, string> = {};
  for (const [k, raw] of entries) {
    if (!TAG_RE.test(k) || typeof raw !== "string") return null;
    const s = raw.trim();
    if (!valueOk(s)) return null;
    out[k] = s;
  }
  return out;
}

export function parseWelcomeConfig(data: unknown): { ok: true; value: WelcomeConfig } | { ok: false; field: string } {
  if (!data || typeof data !== "object") return { ok: false, field: "(全体)" };
  const d = data as Record<string, unknown>;
  const defaultPostId = d.defaultPostId === undefined ? "" : d.defaultPostId;
  if (typeof defaultPostId !== "string" || (defaultPostId && !ID_RE.test(defaultPostId))) return { ok: false, field: "defaultPostId" };
  const byTag = map(d.byTag, (s) => ID_RE.test(s));
  if (!byTag) return { ok: false, field: "byTag" };
  const message = d.message === undefined ? "" : d.message;
  if (typeof message !== "string" || message.trim().length > MAX_MESSAGE) return { ok: false, field: "message" };
  const messages = map(d.messages, (s) => s.length > 0 && s.length <= MAX_MESSAGE);
  if (!messages) return { ok: false, field: "messages" };
  return { ok: true, value: { defaultPostId, byTag, message: message.trim(), messages } };
}

/**
 * ゲストのタグから、表示する投稿 ID と一言を決める。
 * ★全員に付くタグ（all・guest）より、グループのタグを優先する★ 先に見つかったグループのタグを使う。
 */
export function pickWelcome(config: WelcomeConfig, tags: readonly string[]): { postId: string; message: string; tag: string | null } {
  const generic = new Set(["all", "guest"]);
  const ordered = [...tags.filter((t) => !generic.has(t)).sort(), ...tags.filter((t) => generic.has(t))];
  const postTag = ordered.find((t) => config.byTag[t]) ?? null;
  const msgTag = ordered.find((t) => config.messages[t]) ?? null;
  return {
    postId: postTag ? config.byTag[postTag] : config.defaultPostId,
    message: (msgTag ? config.messages[msgTag] : "") || config.message,
    tag: postTag,
  };
}
