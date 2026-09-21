import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { postJson } from "@/lib/api-client";
import type { MediaItem } from "@/types";

export const MAX_MEDIA_PER_POST = 4;
export const MAX_ORIGINAL_BYTES = 60 * 1024 * 1024;
/** iOS では転送が無言で止まることがある。進捗が来ない時間の上限 */
export const ORIGINAL_STALL_MS = 45_000;

/** 保管先は Cloudflare R2。設定の有無はサーバーでしか分からないため常に true。
 *  未設定なら presign が 500 を返すので、そこで気づける。 */
export function isStorageConfigured(): boolean {
  return true;
}

export function extOf(file: File): string {
  return (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** 保存先のオブジェクト。非公開バケットのものは url を持たない */
export type UploadedObject = { path: string; bytes: number; url?: string };

type PresignResult = { key: string; url?: string; publicUrl: string | null };

/**
 * 署名付き URL の取得。
 * ★キーもバケットもサーバーが決める★ クライアントは指定できない。
 * api-client が Firebase の ID トークンを自動で付ける。
 */
async function presign(payload: {
  kind: "thumb" | "original";
  contentType: string;
  bytes?: number;
  ext?: string;
  key?: string;
  reserveOnly?: boolean;
}): Promise<PresignResult> {
  return postJson<PresignResult>("/api/uploads/presign", payload);
}

/** 進捗を取る必要がない小さめの PUT */
async function putSimple(signedUrl: string, blob: Blob, contentType: string) {
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`アップロードに失敗しました (${res.status}) ${detail.slice(0, 200)}`);
  }
}

/**
 * 第1段: 軽量版。投稿を即座に成立させるため待って上げる。
 * 公開バケットに入り、カスタムドメインで配信される。
 * 動画もここを通す（圧縮せず1段階）。
 */
export async function uploadThumb(
  blob: Blob,
  contentType = "image/jpeg",
  kind: "thumb" | "original" = "thumb",
  ext = "jpg",
): Promise<{ url: string; key: string }> {
  const r = await presign({ kind, contentType, bytes: blob.size, ext });
  if (!r.url) throw new Error("署名付き URL を取得できませんでした");
  if (!r.publicUrl) throw new Error("公開 URL を取得できませんでした");
  await putSimple(r.url, blob, contentType);
  return { url: r.publicUrl, key: r.key };
}

/**
 * 原本のキーだけ先に確保する。
 * 本アップロードは後日（自宅の Wi-Fi）に行われるため、
 * 寿命の短い署名は保存せず、送る直前に取り直す。
 */
export async function reserveOriginalKey(ext: string, contentType: string): Promise<string> {
  const r = await presign({ kind: "original", contentType, ext, reserveOnly: true });
  return r.key;
}

/** 進捗が止まったことを表す。通常の通信エラーと区別するために型で分ける */
class StallError extends Error {}

function putWithProgress(
  signedUrl: string,
  key: string,
  file: Blob,
  contentType: string,
  onProgress: (ratio: number) => void,
): Promise<UploadedObject> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // 進捗が来るたびに時限を張り直す。一定時間まったく進まなければ打ち切る。
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          xhr.abort();
        } catch {
          /* 既に終わっていても構わない */
        }
        reject(
          new StallError(`${Math.round(ORIGINAL_STALL_MS / 1000)}秒間まったく進みませんでした`),
        );
      }, ORIGINAL_STALL_MS);
    };

    const done = () => {
      settled = true;
      if (timer) clearTimeout(timer);
    };

    arm();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (ev) => {
      arm();
      if (ev.lengthComputable && ev.total > 0) onProgress(ev.loaded / ev.total);
    };
    xhr.onload = () => {
      if (settled) return;
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        // ★非公開バケットなので url は返さない★
        resolve({ path: key, bytes: file.size });
      } else {
        reject(
          new Error(
            `アップロードに失敗しました (${xhr.status}) ${String(xhr.responseText).slice(0, 200)}`,
          ),
        );
      }
    };
    xhr.onerror = () => {
      if (settled) return;
      done();
      reject(new Error("ネットワークエラーで送信できませんでした"));
    };
    xhr.onabort = () => {
      /* ストール検知側で reject 済み */
    };

    xhr.send(file);
  });
}

async function attemptPut(
  key: string,
  file: Blob,
  onProgress: (ratio: number) => void,
): Promise<UploadedObject> {
  const contentType = file.type || "application/octet-stream";
  const r = await presign({ kind: "original", key, contentType, bytes: file.size });
  if (!r.url) throw new Error("署名付き URL を取得できませんでした");
  return putWithProgress(r.url, r.key, file, contentType, onProgress);
}

/**
 * 第2段: 原本。EXIF を含む生データのまま非公開バケットへ送る。
 *
 * ★XHR を使う理由★
 *   fetch では送信側の進捗が取れない。プログレスバーと
 *   iOS の無言ストール検知は、どちらも upload.onprogress が前提。
 *
 * 止まった場合は署名を取り直して1回だけやり直す。
 * 署名の寿命が短いので、再試行では必ず新しい URL を取る。
 */
export async function uploadOriginal(
  key: string,
  file: Blob,
  onProgress: (ratio: number) => void,
): Promise<UploadedObject> {
  try {
    return await attemptPut(key, file, onProgress);
  } catch (e) {
    if (!(e instanceof StallError)) throw e;
    console.warn("[upload] 停止を検知したため、署名を取り直して1回だけやり直します", key);
    onProgress(0);
    return attemptPut(key, file, onProgress);
  }
}

/**
 * 原本の保管結果を既存の Post にマージする。
 *
 * ★originalUrl は書かない★
 *   原本は非公開バケットにあり、公開 URL が存在しない。
 *   ここに到達不能な URL を入れると、MediaLightbox の
 *   `originalUrl ?? url` が壊れて拡大表示が 403 になる。
 *   後日 Worker が EXIF を剥がして公開側へ書き出したときに、
 *   そこで初めて originalUrl を埋める。
 *
 * ★トランザクション必須★ 複数枚が同時に完了すると
 * media 配列の read-modify-write が書き負けるため。
 */
export async function attachOriginal(
  postId: string,
  thumbPath: string,
  original: UploadedObject,
) {
  await patchMediaItem(postId, thumbPath, {
    ...(original.url ? { originalUrl: original.url } : {}),
    originalPath: original.path,
    originalBytes: original.bytes,
    originalStatus: "uploaded",
  });
}

export async function markOriginalFailed(postId: string, thumbPath: string) {
  await patchMediaItem(postId, thumbPath, { originalStatus: "failed" });
}

/**
 * 原本を持っている端末が見つからない、と本人が申告したときに立てる。
 * 元の端末のキューが生きていれば、そちらから送信されて uploaded に戻る。
 */
export async function markOriginalUnavailable(postId: string, thumbPath: string) {
  await patchMediaItem(postId, thumbPath, { originalStatus: "unavailable" });
}

async function patchMediaItem(
  postId: string,
  thumbPath: string,
  patch: Partial<MediaItem>,
) {
  const postRef = doc(db, "posts", postId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(postRef);
    if (!snap.exists()) return;

    const media = (snap.data().media ?? []) as MediaItem[];
    const next = media.map((m) =>
      m.storagePath === thumbPath ? { ...m, ...patch } : m,
    );

    // Rules の author 編集ブランチが許すキーだけを触る
    tx.update(postRef, { media: next, updatedAt: serverTimestamp() });
  });
}
