import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { firebaseApp } from "@/lib/firebase";
import type { MediaItem } from "@/types";

const MAX_BYTES = 15 * 1024 * 1024;

/** Storage バケット未作成でも画面が壊れないようにするためのガード */
export function isStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
}

export async function uploadMedia(file: File, uid: string): Promise<MediaItem> {
  if (!isStorageConfigured()) {
    throw new Error("Storage バケットが未作成です（次フェーズで作成します）");
  }
  if (file.size > MAX_BYTES) throw new Error("1ファイル 15MB までです");

  const type: MediaItem["type"] = file.type.startsWith("video/") ? "video" : "image";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `uploads/${uid}/${crypto.randomUUID()}.${ext}`;

  const storage = getStorage(firebaseApp);
  const snap = await uploadBytes(ref(storage, storagePath), file, { contentType: file.type });
  const url = await getDownloadURL(snap.ref);

  return { type, url, storagePath, alt: file.name };
}
