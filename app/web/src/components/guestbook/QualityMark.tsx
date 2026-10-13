"use client";

import { useState } from "react";
import type { Post } from "@/types";
import { postQuality, type Quality } from "@/lib/original-status";

// 状態の色（成功 = emerald、未送信・警告 = amber）。タイムラインの「本アップロード待ち」と同じ系統
const DOT: Record<Quality, string> = {
  high: "bg-emerald-500",
  low: "bg-amber-400",
};

/**
 * 自分の投稿の画質を表すマーク。マイページの「⋯」の左に置く（Issue #128）。
 * 緑 = 高画質版を保存済み、黄 = 低画質版だけ。文字は出さず、押すと短い説明が出る。
 * 写真の無い投稿・動画だけの投稿には出さない（postQuality が null）。
 *
 * ★押せる要素はすべて button にする★ PostCard は button などへのタップを「カードを開く」として扱わない。
 */
export function QualityMark({ post }: { post: Post }) {
  const [open, setOpen] = useState(false);
  const q = postQuality(post);
  if (!q) return null;

  return (
    <div className="relative -mt-2 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`写真の画質: ${q.note}`}
        className="flex h-11 w-8 touch-manipulation items-center justify-center"
      >
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${DOT[q.quality]}`} />
      </button>
      {open && (
        <>
          {/* 外側のタップで閉じる */}
          <button
            type="button"
            aria-label="説明を閉じる"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <p
            role="status"
            className="absolute right-0 top-full z-30 w-56 rounded-xl bg-stone-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
          >
            {q.note}
          </p>
        </>
      )}
    </div>
  );
}
