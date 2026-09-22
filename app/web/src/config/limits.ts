/**
 * アップロードの上限。クライアントとサーバーの唯一の真実。
 *
 * ★MAX_ORIGINAL_BYTES は Worker の MAX_BYTES と必ず一致させること★
 *   infra/workers/exif-stripper/wrangler.toml の MAX_BYTES がこれより小さいと、
 *   「アップロードは成功するが EXIF 除去で必ず弾かれ、高画質版が永久に出ない」
 *   という無言の失敗になる。片方だけ変えないこと。
 *
 * Worker のメモリは 128MB。EXIF 除去は入力と出力の2コピーを同時に持つため、
 * 24MB あたりが安全側の上限になる。
 */
export const MAX_ORIGINAL_BYTES = 24 * 1024 * 1024;

/** 軽量版。ブラウザ側で 1920px / q0.8 に圧縮済みなので十分な余裕 */
export const MAX_THUMB_BYTES = 8 * 1024 * 1024;

/** 動画は圧縮せず1段階で公開バケットへ送るので、軽量版の枠を使う */
export const MAX_VIDEO_BYTES = MAX_THUMB_BYTES;

/**
 * 原本として受け付ける形式。
 * ★Worker の formats.ts が処理できるものだけを並べること★
 *   HEIC/HEIF は formats.ts が意図的に unsupported にしている
 *   （ISOBMFF の iloc オフセット書き換えが危険で、かつブラウザが表示できない）。
 *   ここに足すと「アップロードできたのに必ず隔離される」状態になる。
 */
export const ORIGINAL_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** 軽量版・動画として受け付ける形式。こちらは Worker を通らないので広くてよい */
export const THUMB_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);

export function mb(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}
