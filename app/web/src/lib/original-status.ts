import type { MediaItem, OriginalStatus, Post } from "@/types";

/**
 * 表示用に原本の状態を正規化する。
 *
 * ★旧データの吸収★
 *   published を新設する前の webhook は、公開完了を "uploaded" と書いていた。
 *   その頃のデータには originalUrl が入っているので、
 *   「uploaded かつ originalUrl がある」= 公開済み と読み替える。
 *   これで Firestore の移行バッチは不要になる。
 *
 *   逆に originalUrl が無い "uploaded" は、R2 に届いて Worker 待ちの
 *   本物の処理中なので、そのまま返す。
 */
export function displayStatus(m: MediaItem): OriginalStatus | undefined {
  if (m.originalStatus === "uploaded" && m.originalUrl) return "published";
  return m.originalStatus;
}

/** 写真の画質。high = 高画質版を公開済み、low = 低画質版だけが見えている */
export type Quality = "high" | "low";

/**
 * 原本の状態 → 画質と、マークを押したときの説明（マイページの自分の投稿。Issue #128）。
 *
 * ★Record を全キー必須にしてある★
 *   Partial だと OriginalStatus に値を足したときに、何も表示されないまま型チェックも通ってしまう。
 *   ここと MediaLightbox の ORIGINAL_NOTE をコンパイルエラーにするのが目的。
 * 並び順は説明に使う優先度（先にあるものほど、複数枚の投稿で優先して伝える）。
 * ★uploaded を高画質版と言わない★ R2 には届いたが EXIF 除去がまだで、originalUrl が無い。
 */
const QUALITY: Record<OriginalStatus, { quality: Quality; note: string }> = {
  pending: { quality: "low", note: "低画質版のみ。高画質版は未送信です" },
  failed: { quality: "low", note: "低画質版のみ。高画質版の送信に失敗しています" },
  uploaded: { quality: "low", note: "低画質版のみ。高画質版は処理中です（数分かかります）" },
  skipped: { quality: "low", note: "低画質版のみ。高画質版は保存できませんでした" },
  unavailable: { quality: "low", note: "低画質版のみ。高画質版は取得できませんでした" },
  published: { quality: "high", note: "高画質版を保存済みです" },
};
const QUALITY_ORDER = Object.keys(QUALITY) as OriginalStatus[];

/**
 * 投稿の画質。1枚でも低画質版なら low、すべて高画質版になったら high。
 * 動画と、原本の状態を持たない写真（二段階アップロードより前のデータ）は数えない。
 * 数える写真が無ければ null（マークを出さない）。
 */
export function postQuality(post: Pick<Post, "media">): { quality: Quality; note: string } | null {
  const statuses = new Set<OriginalStatus>();
  for (const m of post.media) {
    const s = m.type === "image" ? displayStatus(m) : undefined;
    if (s) statuses.add(s);
  }
  const first = QUALITY_ORDER.find((s) => statuses.has(s));
  return first ? QUALITY[first] : null;
}
