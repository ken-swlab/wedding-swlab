import imageCompression from "browser-image-compression";

export const THUMB_MAX_EDGE = 1920;
export const THUMB_QUALITY = 0.8;
export const THUMB_MAX_MB = 1.5;

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
    fileType: "image/jpeg",
  });

  const { width, height } = await readDimensions(blob);
  return { blob, width, height };
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
