/**
 * Firestore の config/welcome の形の確認（Issue #150）。クライアントからは読み書きできない（Rules の既定の拒否）。
 *
 *   {
 *     defaultPostId: "…",                    // 全員向けの投稿（任意）
 *     byTag: { "friends_groom": "…", … },   // タグ → 投稿 ID（任意）
 *     message: "来てくれて、ありがとう",       // 本文の一言の既定（任意）
 *     messages: { "c_xxxxxxxx": "〇〇大水泳部のみんなへ" }, // タグごとの一言（任意）
 *   }
 *
 * ★タグの優先順は、タグの管理（/admin/tags）の並び順★（Issue #248）上ほど優先。以前の priority（Issue #215）は
 *   読み込みで無視し（残っていても壊れない）、保存では書かない。並び順は呼び出し側が pickWelcome に渡す
 *   （サーバーは lib/tags-server.ts の welcomeTagOrder、画面は tags の購読の並び順）。
 *
 * 編集は管理画面の /admin/welcome（PUT /api/admin/welcome）から。
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
/** 一言の最大の文字数。管理画面の入力欄もこれを使う */
export const MAX_MESSAGE = 60;
/** byTag・messages の最大の件数 */
export const MAX_ENTRIES = 50;

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
  // ★priority（以前の優先順。Issue #215）は見ない★ 残っていても、形が違っていても壊れない（Issue #248）
  return { ok: true, value: { defaultPostId, byTag, message: message.trim(), messages } };
}

/** 全員に付くタグ。グループのタグより後に回す */
const GENERIC_TAGS = new Set(["all", "guest"]);

/**
 * タグを調べる順。
 * ★タグの並び順 → 並び順にないグループのタグ（文字順）→ all・guest の順★（Issue #215・#248）
 *   all・guest は並び順のどこにあっても最後（全員に付くので、グループのタグより先に当たると意味がない）。
 *   並び順にないタグ（作った直後で、まだ辞書に届いていないなど）は、並び順の最後に置いて扱う。
 */
export function welcomeTagOrder(tagOrder: readonly string[], tags: readonly string[]): string[] {
  const has = new Set(tags);
  const ranked = tagOrder.filter((t) => has.has(t) && !GENERIC_TAGS.has(t));
  const rankedSet = new Set(ranked);
  const rest = [...has].filter((t) => !GENERIC_TAGS.has(t) && !rankedSet.has(t)).sort();
  const generic = [...has].filter((t) => GENERIC_TAGS.has(t)).sort();
  return [...ranked, ...rest, ...generic];
}

/**
 * ゲストのタグから、表示する投稿 ID と一言を決める。画面（/admin/welcome の「確かめる」）でも同じ関数を呼ぶ。
 * tagOrder: タグの並び順（タグの管理の順。上ほど優先。Issue #248）。
 * ★全員に付くタグ（all・guest）より、グループのタグを優先する★ 写真の設定されたタグが無ければ defaultPostId。
 *   一言も同じ順で、一言の設定されたタグを探す（無ければ message）。
 */
export function pickWelcome(
  config: WelcomeConfig,
  tags: readonly string[],
  tagOrder: readonly string[],
): { postId: string; message: string; tag: string | null } {
  const ordered = welcomeTagOrder(tagOrder, tags);
  const postTag = ordered.find((t) => config.byTag[t]) ?? null;
  const msgTag = ordered.find((t) => config.messages[t]) ?? null;
  return {
    postId: postTag ? config.byTag[postTag] : config.defaultPostId,
    message: (msgTag ? config.messages[msgTag] : "") || config.message,
    tag: postTag,
  };
}
