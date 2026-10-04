import type { Post } from "@/types";

/**
 * 投稿の検索（端末内）。
 *
 * ★Firestore には問い合わせない★
 *   全文検索の仕組みが無いうえ、hashtags の array-contains と、Rules が必須にしている
 *   visibleToTags の array-contains-any は1つのクエリに同時に入れられない。
 *   読み込み済みの投稿（購読中の最新分＋「もっと見る」の分）だけを対象にする。
 */

/** 照合用に寄せる。ハッシュタグの保存形式（lib/text.ts の normalizeToken）と同じ */
export function normalizeSearch(s: string): string {
  return s.normalize("NFKC").toLowerCase().trim();
}

function isHashTerm(term: string): boolean {
  return term.startsWith("#") || term.startsWith("＃");
}

export type SearchTerm = { kind: "hashtag" | "text"; value: string };

/** 空白で区切った語に分ける。# で始まる語はハッシュタグとして扱う */
export function parseQuery(q: string): SearchTerm[] {
  return q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) =>
      isHashTerm(t)
        ? { kind: "hashtag" as const, value: normalizeSearch(t.slice(1)) }
        : { kind: "text" as const, value: normalizeSearch(t) },
    )
    .filter((t) => t.value !== "");
}

/** すべての語に当たる投稿だけを残す（AND）。ハッシュタグは前方一致 */
export function filterPosts(posts: Post[], terms: SearchTerm[]): Post[] {
  if (terms.length === 0) return posts;
  return posts.filter((p) => {
    const text = normalizeSearch(`${p.text}\n${p.authorName}`);
    return terms.every((t) =>
      t.kind === "hashtag"
        ? p.hashtags.some((h) => h.startsWith(t.value))
        : text.includes(t.value),
    );
  });
}

/** 入力の最後の語が # で始まっていれば、その途中の文字列（# 抜き）を返す */
export function hashtagDraft(q: string): string | null {
  const last = q.split(/\s+/).pop() ?? "";
  return isHashTerm(last) ? normalizeSearch(last.slice(1)) : null;
}

/** 読み込み済みの投稿にあるハッシュタグを、使われた回数の多い順に返す */
export function suggestHashtags(posts: Post[], prefix: string, max: number): string[] {
  const counts = new Map<string, number>();
  for (const p of posts) {
    for (const h of p.hashtags) {
      if (h.startsWith(prefix)) counts.set(h, (counts.get(h) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .slice(0, max)
    .map(([h]) => h);
}

/** 最後の語を選んだハッシュタグに置き換える */
export function applyHashtag(q: string, tag: string): string {
  const parts = q.split(/\s+/);
  parts[parts.length - 1] = `#${tag}`;
  return `${parts.join(" ")} `;
}
