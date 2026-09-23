import type { MediaItem, OriginalStatus } from "@/types";

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
