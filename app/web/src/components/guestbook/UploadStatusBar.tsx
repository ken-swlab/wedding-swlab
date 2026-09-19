"use client";

import type { UploadJob } from "@/hooks/useUpload";

function formatMB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function UploadStatusBar({
  jobs,
  onRetry,
  onDismiss,
}: {
  jobs: UploadJob[];
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const pending = jobs.filter((j) => j.status === "queued" || j.status === "uploading");
  const failed = jobs.filter((j) => j.status === "failed");
  const done = jobs.filter((j) => j.status === "done");

  if (jobs.length === 0) return null;

  if (pending.length > 0) {
    const current = pending.find((j) => j.status === "uploading");
    const totalBytes = pending.reduce((n, j) => n + j.bytes, 0);
    const ratio = current?.progress ?? 0;

    return (
      <div className="sticky top-2 z-30 rounded-2xl border border-sky-200 bg-sky-50/95 p-3 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between text-xs font-medium text-sky-900">
          <span>高画質版を送信中… 残り {pending.length} 枚（{formatMB(totalBytes)}）</span>
          <span className="tabular-nums">{Math.round(ratio * 100)}%</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-sky-200">
          <div
            className="h-full rounded-full bg-sky-600 transition-[width] duration-300"
            style={{ width: `${Math.max(3, ratio * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-sky-700">
          この画面を閉じると高画質版が失われます。完了までお待ちください。
        </p>
      </div>
    );
  }

  if (failed.length > 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-medium text-amber-900">
          {failed.length} 枚の高画質版を送信できませんでした
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
          投稿自体は完了しています。電波の良い場所で再試行してください。
        </p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onRetry}
            className="rounded-full bg-amber-700 px-3 py-1 text-xs font-medium text-white hover:bg-amber-800">
            再試行
          </button>
          <button type="button" onClick={onDismiss}
            className="rounded-full px-3 py-1 text-xs text-amber-700 hover:bg-amber-100">
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onDismiss}
      className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
    >
      ✓ {done.length} 枚の高画質版を保存しました
    </button>
  );
}
