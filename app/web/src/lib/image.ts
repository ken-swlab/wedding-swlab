import imageCompression from "browser-image-compression";
import { ICON_MAX_EDGE, ICON_MAX_MB, ICON_QUALITY } from "@/config/profile";

export const THUMB_MAX_EDGE = 1920;
export const THUMB_QUALITY = 0.8;
export const THUMB_MAX_MB = 1.5;

/**
 * ★Web Worker が読み込むライブラリは自前で配信する★
 *   既定では cdn.jsdelivr.net から importScripts する。写真（EXIF の位置情報を含む）を
 *   扱うワーカーで第三者 CDN のコードを動かさず、ゲストの IP も渡さないため、
 *   public/vendor に置いた同じ版を使う（scripts/vendor-sync.mjs で複製）。
 *   ワーカーは blob: の URL で動くので、相対パスではなく絶対 URL で渡す。
 *   読み込みに失敗してもライブラリがメインスレッドでやり直すので、圧縮は止まらない。
 */
const WORKER_LIB_PATH = "/vendor/browser-image-compression.js";

function workerLibUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URL(WORKER_LIB_PATH, window.location.origin).href;
}

export type Compressed = {
  blob: Blob;
  width: number;
  height: number;
};

/**
 * タイムライン表示用の軽量版を作る。
 * canvas で再エンコードするため EXIF（GPS 含む）は落ちる。
 * 向き情報はライブラリ側で反映されるので回転は起きない。
 * ★原本には EXIF が残る★ ので、位置情報を消したい場合は
 * 原本アップロード側にも処理を足すこと。
 */
export async function compressForTimeline(file: File): Promise<Compressed> {
  const blob = await imageCompression(file, {
    maxWidthOrHeight: THUMB_MAX_EDGE,
    initialQuality: THUMB_QUALITY,
    maxSizeMB: THUMB_MAX_MB,
    useWebWorker: true,
    libURL: workerLibUrl(),
    fileType: "image/jpeg",
  });

  const { width, height } = await readDimensions(blob);
  return { blob, width, height };
}

/**
 * プロフィールのアイコン用に小さくする（JPEG。canvas で再エンコードするので EXIF は落ちる）。
 * 丸く切り抜くのは表示側（object-cover）なので、ここでは縦横比を変えない。
 */
export async function compressForIcon(file: File): Promise<Blob> {
  return imageCompression(file, {
    maxWidthOrHeight: ICON_MAX_EDGE,
    initialQuality: ICON_QUALITY,
    maxSizeMB: ICON_MAX_MB,
    useWebWorker: true,
    libURL: workerLibUrl(),
    fileType: "image/jpeg",
  });
}

async function readDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob);
      const size = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      return size;
    } catch {
      /* Safari の古い版などでは下の経路にフォールバック */
    }
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}
