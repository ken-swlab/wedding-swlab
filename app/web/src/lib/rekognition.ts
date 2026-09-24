import "server-only";

import {
  CreateCollectionCommand,
  DeleteFacesCommand,
  DescribeCollectionCommand,
  DetectFacesCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import sharp from "sharp";

export const MAX_DETECT_BYTES = 5 * 1024 * 1024;
export const MIN_CONFIDENCE = 90;
export const MIN_BOX_RATIO = 0.02;
export const MATCH_THRESHOLD = 80;
export const FACE_CROP_PADDING = 0.4;
export const MIN_CROP_PX = 80;

export type Box = { Left: number; Top: number; Width: number; Height: number };
export type NormalizedImage = { data: Buffer; width: number; height: number };

let client: RekognitionClient | null = null;

function rekognition(): RekognitionClient {
  if (client) return client;

  const region = process.env.REKOGNITION_REGION ?? process.env.AWS_REGION;
  const accessKeyId =
    process.env.REKOGNITION_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.REKOGNITION_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("Rekognition の認証情報が設定されていません");
  }

  client = new RekognitionClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

function collectionId(): string {
  return process.env.REKOGNITION_COLLECTION_ID ?? "wedding-faces";
}

let ensured = false;

export async function ensureCollection(): Promise<{ id: string; faceCount: number }> {
  const id = collectionId();
  const c = rekognition();

  try {
    const d = await c.send(new DescribeCollectionCommand({ CollectionId: id }));
    ensured = true;
    return { id, faceCount: d.FaceCount ?? 0 };
  } catch (e) {
    if ((e as { name?: string }).name !== "ResourceNotFoundException") throw e;
  }

  try {
    await c.send(new CreateCollectionCommand({ CollectionId: id }));
    console.info(`[rekognition] コレクション ${id} を作成しました`);
  } catch (e) {
    if ((e as { name?: string }).name !== "ResourceAlreadyExistsException") throw e;
  }

  ensured = true;
  return { id, faceCount: 0 };
}

export function collectionReady(): boolean {
  return ensured;
}

/**
 * ★SSRF 対策★
 *   この関数が受け取る URL は posts.media[].url、つまり
 *   投稿者がクライアントから書き換えられる値。Firestore Rules の
 *   author 編集ブランチは media の更新を許しているため、内部アドレスを
 *   仕込まれるとサーバーがそこへ fetch してしまう。
 *   取得先は許可したホストだけに限定する。
 */
function allowedImageHosts(): Set<string> {
  const hosts = ["firebasestorage.googleapis.com", "storage.googleapis.com"];
  /**
   * ★移行期間は新旧ドメインを両方許可する★
   *   posts.media[].url と faces.imageUrl には旧ドメインの絶対URLが残っている。
   *   ここを新ドメイン1本にすると、過去の投稿の顔検出・再照合が
   *   「許可されていない取得先です」で全部落ちる。
   *   旧ドメインを畳んだあと R2_PUBLIC_BASE_LEGACY を消せばよい。
   */
  for (const v of [
    process.env.NEXT_PUBLIC_MEDIA_BASE,
    process.env.R2_PUBLIC_BASE,
    process.env.R2_PUBLIC_BASE_LEGACY,
  ]) {
    if (!v) continue;
    try {
      hosts.push(new URL(v).hostname);
    } catch {
      /* 未設定・不正な値は無視する */
    }
  }
  return new Set(hosts);
}

export async function fetchImageBytes(url: string): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("画像 URL が不正です");
  }
  if (parsed.protocol !== "https:") throw new Error("https 以外は取得できません");
  if (!allowedImageHosts().has(parsed.hostname)) {
    throw new Error(`許可されていない取得先です: ${parsed.hostname}`);
  }

  const res = await fetch(url, { cache: "no-store", redirect: "error" });
  if (!res.ok) throw new Error(`画像を取得できません (${res.status})`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_DETECT_BYTES) {
    throw new Error("画像が 5MB を超えています");
  }
  return buf;
}

export async function normalizeImage(source: Buffer): Promise<NormalizedImage> {
  const meta = await sharp(source).metadata();

  if ((meta.orientation ?? 1) <= 1) {
    return { data: source, width: meta.width ?? 0, height: meta.height ?? 0 };
  }

  const data = await sharp(source).rotate().jpeg({ quality: 92 }).toBuffer();
  const m2 = await sharp(data).metadata();
  return { data, width: m2.width ?? 0, height: m2.height ?? 0 };
}

export type DetectedFace = { boundingBox: Box; confidence: number };

export async function detectFaces(image: Buffer): Promise<DetectedFace[]> {
  const out = await rekognition().send(
    new DetectFacesCommand({ Image: { Bytes: image }, Attributes: ["DEFAULT"] }),
  );

  return (out.FaceDetails ?? [])
    .filter((f) => {
      const b = f.BoundingBox;
      return (
        b?.Left != null && b.Top != null && b.Width != null && b.Height != null &&
        (f.Confidence ?? 0) >= MIN_CONFIDENCE &&
        b.Width >= MIN_BOX_RATIO &&
        b.Height >= MIN_BOX_RATIO
      );
    })
    .map((f) => ({
      boundingBox: {
        Left: f.BoundingBox!.Left!,
        Top: f.BoundingBox!.Top!,
        Width: f.BoundingBox!.Width!,
        Height: f.BoundingBox!.Height!,
      },
      confidence: f.Confidence ?? 0,
    }));
}

export async function cropFace(img: NormalizedImage, box: Box): Promise<Buffer | null> {
  const { width: W, height: H } = img;
  if (W === 0 || H === 0) return null;

  const bw = box.Width * W;
  const bh = box.Height * H;
  const cx = (box.Left + box.Width / 2) * W;
  const cy = (box.Top + box.Height / 2) * H;

  const side = Math.min(Math.max(bw, bh) * (1 + FACE_CROP_PADDING), Math.min(W, H));
  const half = side / 2;

  const left = Math.round(Math.max(0, Math.min(cx - half, W - side)));
  const top = Math.round(Math.max(0, Math.min(cy - half, H - side)));
  const width = Math.round(Math.min(side, W - left));
  const height = Math.round(Math.min(side, H - top));

  if (width < MIN_CROP_PX || height < MIN_CROP_PX) return null;

  return sharp(img.data)
    .extract({ left, top, width, height })
    .jpeg({ quality: 92 })
    .toBuffer();
}

function sanitizeExternalId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_.\-:]/g, "_").slice(0, 255);
}

export async function indexFace(crop: Buffer, guestUid: string): Promise<string | null> {
  const { id } = await ensureCollection();

  const out = await rekognition().send(
    new IndexFacesCommand({
      CollectionId: id,
      Image: { Bytes: crop },
      ExternalImageId: sanitizeExternalId(guestUid),
      MaxFaces: 1,
      QualityFilter: "AUTO",
      DetectionAttributes: [],
    }),
  );

  return out.FaceRecords?.[0]?.Face?.FaceId ?? null;
}

export type FaceMatch = { guestUid: string; similarity: number };

export async function searchFace(crop: Buffer): Promise<FaceMatch | null> {
  const { id } = await ensureCollection();

  try {
    const out = await rekognition().send(
      new SearchFacesByImageCommand({
        CollectionId: id,
        Image: { Bytes: crop },
        FaceMatchThreshold: MATCH_THRESHOLD,
        MaxFaces: 1,
        QualityFilter: "AUTO",
      }),
    );

    const m = out.FaceMatches?.[0];
    const ext = m?.Face?.ExternalImageId;
    if (!m || !ext) return null;

    const similarity = m.Similarity ?? 0;
    return similarity >= MATCH_THRESHOLD ? { guestUid: ext, similarity } : null;
  } catch (e) {
    if ((e as { name?: string }).name === "InvalidParameterException") return null;
    throw e;
  }
}

export async function deleteIndexedFace(faceId: string): Promise<void> {
  if (!faceId) return;
  const { id } = await ensureCollection();
  await rekognition().send(
    new DeleteFacesCommand({ CollectionId: id, FaceIds: [faceId] }),
  );
}
