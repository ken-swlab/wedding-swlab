"use client";

/**
 * 高画質版（原本）の送信待ちキュー。
 *
 * ★メタデータとバイト列を別ストアに分ける★
 *   同じレコードに ArrayBuffer を同居させると、一覧取得（getAll）のたびに
 *   全写真のバイト列がメモリに展開される。listJobs は1枚送るごとに呼ばれるので、
 *   20枚 × 5MB なら毎回 100MB を確保することになり、
 *   iOS Safari のタブは無言で落ちる（＝「エラーなく固まる」）。
 *   一覧は軽いメタデータだけ、実体は送る直前に1枚ずつ取り出す。
 *
 * ★Blob ではなく ArrayBuffer で持つ★
 *   WebKit には、IndexedDB に入れた Blob の実体参照が
 *   再読み込み後に失効する既知の不具合がある。
 *   純粋なバイト列で持ち、送信直前に Blob へ組み立て直す。
 */

export type QueueStatus = "queued" | "uploading" | "failed";

/** 一覧に載る軽い情報。バイト列は含めない */
export type QueuedJob = {
  id: string;
  /** 別アカウントのキューを消化しないためのガード */
  uid: string;
  postId: string;
  /** 軽量版のパス。Post 内の該当メディアを特定する鍵 */
  thumbPath: string;
  originalPath: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  status: QueueStatus;
  error?: string;
  createdAt: number;
};

export type NewJob = Omit<QueuedJob, "id" | "status" | "error" | "createdAt"> & {
  buffer: ArrayBuffer;
};

/** payloads ストアの1行 */
type PayloadRow = { id: string; buffer: ArrayBuffer };

const DB_NAME = "wedding-uploads";
/** 3 = メタデータ／バイト列の分離。旧バージョンのデータは作り直す */
const DB_VERSION = 3;
const JOB_STORE = "jobs";
const PAYLOAD_STORE = "payloads";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("このブラウザでは写真を一時保存できません"));
  }
  if (dbPromise) return dbPromise;

  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const d = req.result;
      // まだテスト段階のため、旧構造のデータは引き継がず作り直す
      const names = Array.from(d.objectStoreNames);
      for (const name of names) d.deleteObjectStore(name);

      const jobs = d.createObjectStore(JOB_STORE, { keyPath: "id" });
      jobs.createIndex("uid", "uid", { unique: false });
      jobs.createIndex("createdAt", "createdAt", { unique: false });
      d.createObjectStore(PAYLOAD_STORE, { keyPath: "id" });
    };

    req.onsuccess = () => {
      const d = req.result;
      // 別タブがバージョンを上げたら手放す（onblocked を避ける）
      d.onversionchange = () => {
        d.close();
        dbPromise = null;
      };
      resolve(d);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB を開けませんでした"));
    req.onblocked = () =>
      reject(new Error("他のタブでこのページが開いています。閉じてから再読み込みしてください"));
  });

  dbPromise = p;
  p.catch(() => {
    dbPromise = null;
  });
  return p;
}

function txError(t: IDBTransaction): Error {
  return t.error ?? new Error("端末への保存に失敗しました");
}

/** 一覧。★バイト列は読まない★ */
export async function listJobs(uid: string): Promise<QueuedJob[]> {
  const d = await openDb();
  const all = await new Promise<QueuedJob[]>((resolve, reject) => {
    const t = d.transaction(JOB_STORE, "readonly");
    const req = t.objectStore(JOB_STORE).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as QueuedJob[]);
    req.onerror = () => reject(req.error ?? new Error("読み込みに失敗しました"));
    t.onabort = () => reject(txError(t));
  });
  return all.filter((j) => j.uid === uid).sort((a, b) => a.createdAt - b.createdAt);
}

/** 送信する1枚ぶんだけ実体を取り出す */
export async function readPayload(id: string): Promise<ArrayBuffer | null> {
  const d = await openDb();
  return new Promise<ArrayBuffer | null>((resolve, reject) => {
    const t = d.transaction(PAYLOAD_STORE, "readonly");
    const req = t.objectStore(PAYLOAD_STORE).get(id);
    req.onsuccess = () => {
      const row = req.result as PayloadRow | undefined;
      resolve(row?.buffer ?? null);
    };
    req.onerror = () => reject(req.error ?? new Error("写真を読み出せませんでした"));
    t.onabort = () => reject(txError(t));
  });
}

export async function addJobs(items: NewJob[]): Promise<void> {
  if (items.length === 0) return;
  const d = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction([JOB_STORE, PAYLOAD_STORE], "readwrite");
    const jobs = t.objectStore(JOB_STORE);
    const payloads = t.objectStore(PAYLOAD_STORE);
    const now = Date.now();

    items.forEach((it, i) => {
      const { buffer, ...meta } = it;
      const id = crypto.randomUUID();
      jobs.put({
        ...meta,
        id,
        status: "queued" as QueueStatus,
        // 同一ミリ秒でも投入順を保てるようにずらす
        createdAt: now + i,
      });
      payloads.put({ id, buffer });
    });

    t.oncomplete = () => resolve();
    t.onabort = () => reject(txError(t));
    t.onerror = () => reject(txError(t));
  });
}

export async function updateJob(id: string, patch: Partial<QueuedJob>): Promise<void> {
  const d = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction(JOB_STORE, "readwrite");
    const store = t.objectStore(JOB_STORE);
    const get = store.get(id);
    get.onsuccess = () => {
      const cur = get.result as QueuedJob | undefined;
      if (cur) store.put({ ...cur, ...patch });
    };
    t.oncomplete = () => resolve();
    t.onabort = () => reject(txError(t));
    t.onerror = () => reject(txError(t));
  });
}

/** メタデータと実体をまとめて捨てる */
export async function deleteJob(id: string): Promise<void> {
  const d = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction([JOB_STORE, PAYLOAD_STORE], "readwrite");
    t.objectStore(JOB_STORE).delete(id);
    t.objectStore(PAYLOAD_STORE).delete(id);
    t.oncomplete = () => resolve();
    t.onabort = () => reject(txError(t));
    t.onerror = () => reject(txError(t));
  });
}

/**
 * 送信中にタブを閉じられた／落とされたジョブを queued に戻す。
 * Firebase の resumable セッションは引き継がないので、その1件はやり直す。
 */
export async function resetStuckJobs(uid: string): Promise<number> {
  const stuck = (await listJobs(uid)).filter((j) => j.status === "uploading");
  for (const j of stuck) await updateJob(j.id, { status: "queued", error: undefined });
  return stuck.length;
}

/** 端末ストレージの自動削除を受けにくくする。非対応環境では何もしない */
export async function requestPersist(): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    /* 非対応でも構わない */
  }
  return false;
}

export function isQuotaError(e: unknown): boolean {
  if (e instanceof DOMException) {
    return e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED";
  }
  return e instanceof Error && /quota|storage/i.test(e.message);
}
