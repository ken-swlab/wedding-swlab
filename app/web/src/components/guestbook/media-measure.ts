import type { MediaItem } from "@/types";

/**
 * 写真・動画の元の縦横の大きさ（ビューアが広がる元のマスの大きさ）。
 * ★ビューア（MediaLightbox）の本体と分けて置く★（Issue #250）一覧（MediaGrid）はこれだけを最初に読み、
 *   ビューアの本体は開いたときに読む（最初の JS を小さくするため）。
 */
export type MediaSize = { w: number; h: number };

/** 一覧のマスに表示済みの写真・動画から、元の縦横の大きさを読む */
export function measureMedia(cell: HTMLElement, m: MediaItem): MediaSize | null {
  const img = cell.querySelector("img");
  if (img?.naturalWidth) return { w: img.naturalWidth, h: img.naturalHeight };
  const video = cell.querySelector("video");
  if (video?.videoWidth) return { w: video.videoWidth, h: video.videoHeight };
  return m.width && m.height ? { w: m.width, h: m.height } : null;
}
