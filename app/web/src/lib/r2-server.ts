import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  MAX_ORIGINAL_BYTES,
  MAX_THUMB_BYTES,
  ORIGINAL_CONTENT_TYPES,
  THUMB_CONTENT_TYPES,
} from "@/config/limits";

/**
 * Cloudflare R2（S3 互換）への署名付き URL 発行。
 *
 * ★バケットを2つに分ける★
 *   thumb    → 公開バケット。カスタムドメインで配信する
 *   original → 非公開バケット。EXIF(GPS) が付いたまま入るので、
 *              公開 URL を一切持たせない。EXIF 除去は後日 Worker で行う。
 *
 * ★kind と名前空間は必ず一致させる★
 *   u/{uid}/t/ は公開バケット、u/{uid}/o/ は非公開バケット。
 *   ここを突き合わせないと、kind:"thumb" に o/ のキーを渡すだけで
 *   EXIF 付きの原本を公開バケットへ直接 PUT できてしまう。
 *   つまり EXIF 除去パイプラインを丸ごと迂回できる。
 */

export const ALLOWED_CONTENT_TYPES = THUMB_CONTENT_TYPES;
export { MAX_THUMB_BYTES, MAX_ORIGINAL_BYTES };
/** 後方互換のための別名。実体は MAX_ORIGINAL_BYTES */
export const MAX_OBJECT_BYTES = MAX_ORIGINAL_BYTES;

export type UploadKind = "thumb" | "original";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} が未設定です`);
  return v;
}

export function bucketFor(kind: UploadKind): string {
  return kind === "thumb" ? env("R2_BUCKET_PUBLIC") : env("R2_BUCKET_PRIVATE");
}

/** kind ごとのキー名前空間。t = thumb(公開), o = original(非公開) */
export function dirFor(kind: UploadKind): "t" | "o" {
  return kind === "thumb" ? "t" : "o";
}

/** kind ごとに許可する Content-Type。原本は Worker が処理できる形式だけ */
export function contentTypesFor(kind: UploadKind): Set<string> {
  return kind === "thumb" ? THUMB_CONTENT_TYPES : ORIGINAL_CONTENT_TYPES;
}

/** kind ごとのサイズ上限 */
export function maxBytesFor(kind: UploadKind): number {
  return kind === "thumb" ? MAX_THUMB_BYTES : MAX_ORIGINAL_BYTES;
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
  const e = kind === "thumb" ? safeExt(ext, "jpg") : safeExt(ext, "bin");
  return `u/${uid}/${dirFor(kind)}/${randomUUID()}.${e}`;
}

/**
 * 既存キーへの再署名を許すかどうか。
 *
 * ★kind を必ず受け取ること★
 *   u/{uid}/ の前置だけを見ていた頃は、自分のキーでありさえすれば
 *   t/ のキーを original として、o/ のキーを thumb として署名できた。
 *   後者は「EXIF 付き原本を公開バケットへ直接 PUT する」経路そのものだった。
 */
export function ownsKey(uid: string, key: string, kind: UploadKind): boolean {
  if (!key || key.includes("..") || key.startsWith("/")) return false;
  if (key.length > 256) return false;
  return key.startsWith(`u/${uid}/${dirFor(kind)}/`);
}

/**
 * PUT 用の署名付き URL。
 * ★Content-Type と Content-Length を署名に含める★
 *   これにより、申告と違う型・サイズでの PUT を R2 自身が拒否する。
 */
export async function presignPut(
  kind: UploadKind,
  key: string,
  contentType: string,
  bytes: number,
): Promise<string> {
  const ttl = Number(process.env.R2_PRESIGN_TTL);
  const cmd = new PutObjectCommand({
    Bucket: bucketFor(kind),
    Key: key,
    ContentType: contentType,
    ContentLength: bytes,
  });
  return getSignedUrl(r2(), cmd, {
    expiresIn: Number.isFinite(ttl) && ttl > 0 ? ttl : 300,
    signableHeaders: new Set(["content-type", "content-length"]),
  });
}
