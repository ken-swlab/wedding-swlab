export const MAX_COMMENT_LENGTH = 280;
export const MAX_POST_LENGTH = 2000;
export const MAX_TOKENS = 10; // Rules の hashtags/mentions 上限と合わせる

/**
 * 全角の ＃ ＠ にも対応し、\p{L} で日本語のタグも拾う。
 * ★後読み (?<=) は使わない★ 古い Safari では正規表現のパース自体が
 *   失敗してモジュールごと落ちるため、境界判定は手動で行う。
 */
const TOKEN_RE = /[#＃][\p{L}\p{N}_]+|[@＠][\p{L}\p{N}_]{1,30}/gu;

export type TextToken =
  | { kind: "text"; value: string }
  | { kind: "hashtag"; value: string; key: string }
  | { kind: "mention"; value: string; key: string };

/** 語中（例: mail@example の @）を拾わないための境界判定 */
function isBoundary(prev: string | undefined): boolean {
  return prev === undefined || !/[\p{L}\p{N}_]/u.test(prev);
}

/** 検索・照合用のキー。全角半角と大小文字を寄せる */
function normalizeToken(body: string): string {
  return body.normalize("NFKC").toLowerCase();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** 選んで入れたメンションの前に来てよい文字。日本語は語を空白で区切らないので、半角英数字の直後だけを除く */
function isNameBoundary(prev: string | undefined): boolean {
  return prev === undefined || !/[A-Za-z0-9]/.test(prev);
}

/**
 * 本文を、地の文・#ハッシュタグ・@メンション に分ける。
 *
 * mentionNames: 候補から選んで入れたメンションのニックネーム（投稿・コメントの mentions に保存した値）。
 * ★ニックネームは空白や記号を含められる★ ので、TOKEN_RE（文字・数字・_ だけ）では途中で切れる。
 *   渡された名前は `@名前` の形でそのまま探し、1つのメンションとして扱う（長い名前を先に試す）。
 */
export function tokenizeText(text: string, mentionNames: readonly string[] = []): TextToken[] {
  const tokens: TextToken[] = [];
  let last = 0;

  const names = [...new Set(mentionNames.filter((n) => n.trim()))].sort((a, b) => b.length - a.length);
  const re = names.length
    ? new RegExp(`(?<named>[@＠](?:${names.map(escapeRe).join("|")}))|${TOKEN_RE.source}`, "gu")
    : TOKEN_RE;

  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (m.groups?.named ? !isNameBoundary(text[start - 1]) : !isBoundary(text[start - 1])) continue;

    if (start > last) {
      tokens.push({ kind: "text", value: text.slice(last, start) });
    }

    const raw = m[0];
    const head = raw[0];
    const key = normalizeToken(raw.slice(1));

    tokens.push(
      head === "#" || head === "＃"
        ? { kind: "hashtag", value: raw, key }
        : { kind: "mention", value: raw, key },
    );

    last = start + raw.length;
  }

  if (last < text.length) {
    tokens.push({ kind: "text", value: text.slice(last) });
  }
  return tokens;
}

/**
 * Firestore に保存する hashtags / mentions を取り出す。
 *
 * mentionNames: 候補から選んで入れた相手のニックネーム。
 * ★選んだ相手のニックネームは、打ったままの形で mentions の先頭に入れる★
 *   表示（RichText）がこれを tokenizeText に渡し、空白や記号を含む名前も1つのメンションとして色を付ける。
 *   手で打っただけの @文字 は、従来どおり寄せた形（NFKC・小文字）で入る。
 */
export function extractTags(
  text: string,
  mentionNames: readonly string[] = [],
): { hashtags: string[]; mentions: string[] } {
  const hashtags = new Set<string>();
  const mentions = new Set<string>(mentionNames);
  const picked = new Set(mentionNames.map(normalizeToken));

  for (const t of tokenizeText(text, mentionNames)) {
    if (t.kind === "hashtag") hashtags.add(t.key);
    else if (t.kind === "mention" && !picked.has(t.key)) mentions.add(t.key);
  }

  return {
    hashtags: [...hashtags].slice(0, MAX_TOKENS),
    mentions: [...mentions].slice(0, MAX_TOKENS),
  };
}

let segmenter: Intl.Segmenter | null | undefined;

/**
 * 絵文字を1文字として数える。
 * .length は UTF-16 単位なので「👨‍👩‍👧 = 8文字」になってしまう。
 */
export function countChars(text: string): number {
  if (segmenter === undefined) {
    segmenter =
      typeof Intl !== "undefined" && "Segmenter" in Intl
        ? new Intl.Segmenter("ja", { granularity: "grapheme" })
        : null;
  }
  return segmenter ? [...segmenter.segment(text)].length : [...text].length;
}
