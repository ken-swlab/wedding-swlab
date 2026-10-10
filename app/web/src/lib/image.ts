import imageCompression from "browser-image-compression";
import { ICON_MAX_EDGE, ICON_MAX_MB, ICON_QUALITY } from "@/config/profile";
import { markReencoded, type ReencodedJpeg } from "@/lib/thumb-guard";

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
  blob: ReencodedJpeg;
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
  const out = await imageCompression(file, {
    maxWidthOrHeight: THUMB_MAX_EDGE,
    initialQuality: THUMB_QUALITY,
    maxSizeMB: THUMB_MAX_MB,
    useWebWorker: true,
    libURL: workerLibUrl(),
    fileType: "image/jpeg",
  });

  const blob = markReencoded(out);
  const { width, height } = await readDimensions(blob);
  return { blob, width, height };
}

/** アイコンにする写真を、向きを直して読み込んだもの。使い終わったら close() する */
export type IconSource = {
  image: ImageBitmap | HTMLImageElement;
  /** 向きを直したあとの画素数 */
  width: number;
  height: number;
  close: () => void;
};

/** 切り取る範囲（正方形）。向きを直したあとの写真の画素で表す */
export type IconCrop = { x: number; y: number; size: number };

/**
 * アイコンにする写真を読み込む。読めない形式（ブラウザが HEIC を扱えないときなど）は投げる。
 *
 * ★向きは EXIF から直して読む★（imageOrientation: "from-image"）
 *   直さないと、iPhone の縦写真が切り取り画面で横向きになる。
 *   options を受け付けない古い Safari では <img> で読む（<img> は既定で向きを直す）。
 * ★ここでは読むだけで、EXIF を書き換えない★（CLAUDE.md ルール 11）。送るのは cropForIcon の出力だけ。
 */
export async function loadIconSource(file: File): Promise<IconSource> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (bmp.width > 0 && bmp.height > 0) {
        return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() };
      }
      bmp.close?.();
    } catch {
      /* 下の <img> の経路で読み直す */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new window.Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("画像を読み込めませんでした"));
      img.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("画像を読み込めませんでした");
    return {
      image: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("画像を処理できませんでした"))),
      "image/jpeg",
      quality,
    );
  });
}

/** 容量が上限を超えたときに品質を下げる幅と、下げる限度 */
const ICON_QUALITY_STEP = 0.1;
const ICON_QUALITY_MIN = 0.45;

/**
 * 写真から正方形の範囲を切り取り、アイコン用の JPEG にする（長辺 ICON_MAX_EDGE 以下・ICON_MAX_MB 以下）。
 * 丸く見せるのは表示側（rounded-full）。canvas で再エンコードするので EXIF（GPS を含む）は付かない。
 * 送る直前にも uploadThumb の assertSafeThumb が確かめる。
 */
export async function cropForIcon(source: IconSource, crop: IconCrop): Promise<ReencodedJpeg> {
  // 計算の誤差で写真の外へはみ出さないように収める（はみ出すと余白が写る）
  const size = Math.max(1, Math.min(crop.size, source.width, source.height));
  const x = Math.min(Math.max(crop.x, 0), source.width - size);
  const y = Math.min(Math.max(crop.y, 0), source.height - size);

  const edge = Math.max(1, Math.min(ICON_MAX_EDGE, Math.round(size)));
  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を処理できませんでした");
  // 透過のある PNG は JPEG にすると黒くなるので、白で下塗りする
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, edge, edge);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source.image, x, y, size, size, 0, 0, edge, edge);

  const maxBytes = ICON_MAX_MB * 1024 * 1024;
  let quality = ICON_QUALITY;
  let out = await canvasToJpeg(canvas, quality);
  while (out.size > maxBytes && quality - ICON_QUALITY_STEP >= ICON_QUALITY_MIN) {
    quality -= ICON_QUALITY_STEP;
    out = await canvasToJpeg(canvas, quality);
  }
  return markReencoded(out);
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
