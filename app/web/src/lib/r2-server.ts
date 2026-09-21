import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2（S3 互換）への署名付き URL 発行。
 *
 * ★バケットを2つに分ける★
 *   thumb    → 公開バケット。カスタムドメインで配信する
 *   original → 非公開バケット。EXIF(GPS) が付いたまま入るので、
 *              公開 URL を一切持たせない。EXIF 除去は後日 Worker で行う。
 *   どちらに入れるかは kind から決まり、クライアントは選べない。
 *
 * ★キーはサーバーが発番する★
 *   Firebase Storage 時代はクライアントがパス文字列を組み立て、
 *   Security Rules がパス所有権を検証していた。R2 に Rules は無いので、
 *   「クライアントがパスを指定できない」形にして構造的に塞ぐ。
 *   後日の再署名では u/{uid}/ 前置を検証する。
 */

export const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
]);

/** 軽量版。ブラウザ側で 1920px / q0.8 に圧縮済みなので十分な余裕 */
export const MAX_THUMB_BYTES = 8 * 1024 * 1024;
/** 原本・動画。media.ts の MAX_ORIGINAL_BYTES と揃える */
export const MAX_OBJECT_BYTES = 60 * 1024 * 1024;

export type UploadKind = "thumb" | "original";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} が未設定です`);
  return v;
}

export function bucketFor(kind: UploadKind): string {
  return kind === "thumb" ? env("R2_BUCKET_PUBLIC") : env("R2_BUCKET_PRIVATE");
}

/** 公開 URL を持つのは公開バケットのオブジェクトだけ */
export function publicUrlOf(key: string): string {
  return `${env("R2_PUBLIC_BASE").replace(/\/+$/, "")}/${key}`;
}

let client: S3Client | null = null;
function r2(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env("R2_ACCESS_KEY_ID"),
      secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: true,
  });
  return client;
}

/** 拡張子は英数字のみに正規化する。キーに任意文字列を混ぜさせない */
function safeExt(ext: string, fallback: string): string {
  const e = (ext || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return e || fallback;
}

/**
 * 推測不可能なキーを作る。
 * UUID v4 は 122bit のランダム性があり、総当たりは現実的でない。
 * uid を前置するのは、後日の再署名で所有者を検証できるようにするため。
 */
export function newKey(uid: string, kind: UploadKind, ext: string): string {
  const dir = kind === "thumb" ? "t" : "o";
  const e = kind === "thumb" ? "jpg" : safeExt(ext, "bin");
  return `u/${uid}/${dir}/${randomUUID()}.${e}`;
}

/** 他人のオブジェクトを上書きさせない。パストラバーサルも弾く */
export function ownsKey(uid: string, key: string): boolean {
  if (!key || key.includes("..") || key.startsWith("/")) return false;
  return key.startsWith(`u/${uid}/`);
}

/**
 * PUT 用の署名付き URL。
 * ★Content-Type と Content-Length を署名に含める★
 *   これにより、申告と違う型・サイズでの PUT を R2 自身が拒否する。
 *   Security Rules が無くなっても、サーバー側の制限が実効性を持つ。
 */
export async function presignPut(
  kind: UploadKind,
  key: string,
  contentType: string,
  bytes: number,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: bucketFor(kind),
    Key: key,
    ContentType: contentType,
    ContentLength: bytes,
  });
  return getSignedUrl(r2(), cmd, {
    expiresIn: Number(process.env.R2_PRESIGN_TTL ?? 300),
    signableHeaders: new Set(["content-type", "content-length"]),
  });
}
