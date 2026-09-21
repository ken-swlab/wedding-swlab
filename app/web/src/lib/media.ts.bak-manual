import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import {
  getDownloadURL, getStorage, ref, uploadBytes, uploadBytesResumable,
} from "firebase/storage";
import { db, firebaseApp } from "@/lib/firebase";
import type { MediaItem } from "@/types";

export const MAX_MEDIA_PER_POST = 4;
export const MAX_ORIGINAL_BYTES = 60 * 1024 * 1024;

export function isStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
}

function storage() {
  return getStorage(firebaseApp);
}

export function extOf(file: File): string {
  return (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Storage Rules のパス構造と一致させること */
export function mediaPaths(uid: string, id: string, ext: string) {
  return {
    thumb: `uploads/${uid}/thumb/${id}.jpg`,
    original: `uploads/${uid}/original/${id}.${ext}`,
  };
}

/** 第1段: 軽量版。投稿を即座に成立させるため待って上げる */
export async function uploadThumb(
  path: string,
  blob: Blob,
  contentType = "image/jpeg",
): Promise<string> {
  const snap = await uploadBytes(ref(storage(), path), blob, { contentType });
  return getDownloadURL(snap.ref);
}

/**
 * 第2段: 原本。resumable を使うことで
 *  - 進捗が取れる
 *  - 会場 Wi-Fi の瞬断からある程度復帰できる
 */
export function uploadOriginal(
  path: string,
  file: File,
  onProgress: (ratio: number) => void,
): Promise<{ url: string; path: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage(), path), file, {
      contentType: file.type || "application/octet-stream",
    });

    task.on(
      "state_changed",
      (s) => onProgress(s.totalBytes > 0 ? s.bytesTransferred / s.totalBytes : 0),
      reject,
      async () => {
        try {
          resolve({
            url: await getDownloadURL(task.snapshot.ref),
            path,
            bytes: task.snapshot.totalBytes,
          });
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}

/**
 * 原本の URL を既存の Post にマージする。
 * ★トランザクション必須★ 複数枚が同時に完了すると
 * media 配列の read-modify-write が書き負けるため。
 */
export async function attachOriginal(
  postId: string,
  thumbPath: string,
  original: { url: string; path: string; bytes: number },
) {
  await patchMediaItem(postId, thumbPath, {
    originalUrl: original.url,
    originalPath: original.path,
    originalBytes: original.bytes,
    originalStatus: "uploaded",
  });
}

export async function markOriginalFailed(postId: string, thumbPath: string) {
  await patchMediaItem(postId, thumbPath, { originalStatus: "failed" });
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
