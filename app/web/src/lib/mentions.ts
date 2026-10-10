import { MAX_MENTIONS, MENTION_QUERY_MAX, MENTION_SUGGEST_MAX } from "@/config/mentions";

/** メンションの候補・選んだ相手。name はニックネーム（本名は guests に無い） */
export type MentionPerson = { uid: string; name: string };

/** 照合用に寄せる: 全角半角・大文字小文字・ひらがなとカタカナの違いを無視する */
export function foldForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 入力中のメンション（`@` の位置と、そのあとに打った絞り込みの語） */
export type MentionDraft = { at: number; query: string };

/**
 * カーソルの直前にある入力中の `@…` を探す。無ければ null。
 *
 * - `@` の前が半角英数字（メールアドレスなど）のときは対象にしない。
 * - `@` からカーソルまでに改行があれば対象にしない。
 * - すでに選んで入れたメンション（`@ニックネーム`）の続きは対象にしない
 *   （ニックネームは空白を含められるので、空白では区切れない）。
 */
export function findMentionDraft(text: string, caret: number, picked: readonly MentionPerson[]): MentionDraft | null {
  const head = text.slice(0, caret);
  const at = Math.max(head.lastIndexOf("@"), head.lastIndexOf("＠"));
  if (at < 0) return null;
  if (at > 0 && /[A-Za-z0-9]/.test(head[at - 1])) return null;

  const query = head.slice(at + 1);
  if (query.length > MENTION_QUERY_MAX || /[\n\r]/.test(query)) return null;
  if (picked.some((p) => query.startsWith(p.name))) return null;
  return { at, query };
}

/**
 * 候補を絞り込む。前方一致を先に、部分一致をあとに並べる。
 * 語に空白が入っていて誰にも当たらないときは null（メンションではなく地の文として扱い、一覧を閉じる）。
 */
export function suggestMentions(people: readonly MentionPerson[], query: string): MentionPerson[] | null {
  const q = foldForMatch(query);
  const starts: MentionPerson[] = [];
  const contains: MentionPerson[] = [];
  for (const p of people) {
    const name = foldForMatch(p.name);
    if (name.startsWith(q)) starts.push(p);
    else if (name.includes(q)) contains.push(p);
  }
  const byName = (a: MentionPerson, b: MentionPerson) => a.name.localeCompare(b.name, "ja");
  const hit = [...starts.sort(byName), ...contains.sort(byName)];
  if (hit.length === 0 && /\s/.test(query)) return null;
  return hit.slice(0, MENTION_SUGGEST_MAX);
}

/**
 * 手で打った `@ニックネーム`（候補から選んでいないもの）の相手を探す。
 *
 * ★相手が1人に決まるときだけ拾う★ 間違った人に通知が届くより、届かないほうがまし。
 *   - ニックネームの全体が一致すること（大文字小文字・全角半角・ひらがなとカタカナの違いは無視）
 *   - その名前の候補が1人だけであること（同じニックネームが2人以上いたら拾わない。候補から選んでもらう）
 *   - 名前のすぐあとに文字や数字が続かないこと（「@たろう」で「たろうまる」さんを、
 *     「@Kenji」で「Ken」さんを拾わない。「@たろうさん」も拾わないので、空白か記号で区切る）
 *   - `@` の前が半角英数字でないこと（メールアドレスなど）
 * 返す name は本文に打たれたままの形（表示の色付けがその形で探すため）。
 */
export function typedMentions(text: string, candidates: readonly MentionPerson[]): MentionPerson[] {
  if (candidates.length === 0) return [];
  const folded = candidates.map((p) => ({ person: p, key: foldForMatch(p.name) })).filter((c) => c.key);
  const byLength = [...folded].sort((a, b) => b.person.name.length - a.person.name.length);
  const out: MentionPerson[] = [];
  const seen = new Set<string>();

  for (let at = 0; at < text.length; at++) {
    if (text[at] !== "@" && text[at] !== "＠") continue;
    if (at > 0 && /[A-Za-z0-9]/.test(text[at - 1])) continue;

    for (const c of byLength) {
      const raw = text.slice(at + 1, at + 1 + c.person.name.length);
      if (foldForMatch(raw) !== c.key) continue;
      const next = text[at + 1 + raw.length];
      const openEnded = /[\p{L}\p{N}_]$/u.test(raw) && next !== undefined && /[\p{L}\p{N}_]/u.test(next);
      // いちばん長く一致した名前で決める（短い名前へは落とさない）
      if (!openEnded && folded.filter((f) => f.key === c.key).length === 1 && !seen.has(c.person.uid)) {
        seen.add(c.person.uid);
        out.push({ uid: c.person.uid, name: raw });
      }
      break;
    }
  }
  return out;
}

/** 本文に `@ニックネーム` がいくつ残っているか */
function countMentions(text: string, name: string): number {
  return text.split(`@${name}`).length - 1 + (text.split(`＠${name}`).length - 1);
}

/**
 * 送信するメンション。選んだ人のうち、本文に `@ニックネーム` が残っている人だけにする。
 * ★相手は uid で決める★ ニックネームは重複できるので、文字列からは相手を特定できない。
 * ★同じニックネームの人を選び直したときは、あとから選んだ人を残す★
 *   本文に残っている `@ニックネーム` の数までしか数えない（消した分の相手に通知を送らないため）。
 *   picked は選んだ順（選び直した人は末尾）に並んでいる前提。
 */
export function activeMentions(text: string, picked: readonly MentionPerson[]): MentionPerson[] {
  const room = new Map<string, number>();
  const seen = new Set<string>();
  const out: MentionPerson[] = [];
  for (let i = picked.length - 1; i >= 0; i--) {
    const p = picked[i];
    if (seen.has(p.uid)) continue;
    const left = room.get(p.name) ?? countMentions(text, p.name);
    if (left <= 0) continue;
    room.set(p.name, left - 1);
    seen.add(p.uid);
    out.unshift(p);
  }
  return out.slice(0, MAX_MENTIONS);
}
