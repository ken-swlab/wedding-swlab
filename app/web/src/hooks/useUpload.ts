"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { attachOriginal, markOriginalFailed, uploadOriginal } from "@/lib/media";

export type UploadJob = {
  id: string;
  postId: string;
  /** 軽量版のパス。Post 内の該当メディアを特定する鍵 */
  thumbPath: string;
  originalPath: string;
  fileName: string;
  bytes: number;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "done" | "failed";
  error?: string;
};

export type EnqueueItem = Omit<UploadJob, "id" | "progress" | "status" | "error">;

/**
 * 原本を裏で1件ずつ送るキュー。
 *
 * ★Composer の中に置いてはいけない★
 *   投稿直後に Composer はリセットされるため、中に持たせると
 *   原本の送信が中断される。ページ側にマウントして使うこと。
 *
 * 並列ではなく直列にしているのは、会場 Wi-Fi を複数ゲストで
 * 共有する前提で、1人が帯域を占有しないようにするため。
 */
export function useUpload() {
  const queueRef = useRef<UploadJob[]>([]);
  const activeRef = useRef(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);

  const sync = useCallback(() => setJobs([...queueRef.current]), []);

  const patch = useCallback(
    (id: string, p: Partial<UploadJob>) => {
      queueRef.current = queueRef.current.map((j) => (j.id === id ? { ...j, ...p } : j));
      sync();
    },
    [sync],
  );

  const pump = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;

    try {
      for (;;) {
        const next = queueRef.current.find((j) => j.status === "queued");
        if (!next) break;

        patch(next.id, { status: "uploading", progress: 0 });
        try {
          const result = await uploadOriginal(next.originalPath, next.file, (r) =>
            patch(next.id, { progress: r }),
          );
          await attachOriginal(next.postId, next.thumbPath, result);
          patch(next.id, { status: "done", progress: 1 });
        } catch (e) {
          patch(next.id, {
            status: "failed",
            error: e instanceof Error ? e.message : "送信に失敗しました",
          });
          // 失敗の記録自体が失敗しても握りつぶす（本体の処理は続ける）
          await markOriginalFailed(next.postId, next.thumbPath).catch(() => {});
        }
      }
    } finally {
      activeRef.current = false;
    }
  }, [patch]);

  const enqueue = useCallback(
    (items: EnqueueItem[]) => {
      if (items.length === 0) return;
      queueRef.current = [
        ...queueRef.current,
        ...items.map((i) => ({
          ...i,
          id: crypto.randomUUID(),
          progress: 0,
          status: "queued" as const,
        })),
      ];
      sync();
      void pump();
    },
    [pump, sync],
  );

  const retryFailed = useCallback(() => {
    queueRef.current = queueRef.current.map((j) =>
      j.status === "failed" ? { ...j, status: "queued" as const, error: undefined, progress: 0 } : j,
    );
    sync();
    void pump();
  }, [pump, sync]);

  const clearDone = useCallback(() => {
    queueRef.current = queueRef.current.filter((j) => j.status !== "done");
    sync();
  }, [sync]);

  const pending = jobs.filter((j) => j.status === "queued" || j.status === "uploading");

  /**
   * 送信中に離脱されると原本が永久に失われるため警告する。
   * ※ LINE 内ブラウザではダイアログが出ないことがあるので、
   *   画面上のステータスバー表示が実質の防波堤になる。
   */
  useEffect(() => {
    if (pending.length === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pending.length]);

  return { jobs, pending, enqueue, retryFailed, clearDone };
}
