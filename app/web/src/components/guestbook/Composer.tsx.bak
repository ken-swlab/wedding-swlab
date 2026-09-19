"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { TAG_DEFS, tagDef } from "@/config/tags";
import { compressForTimeline } from "@/lib/image";
import {
  MAX_MEDIA_PER_POST, MAX_ORIGINAL_BYTES, extOf, isStorageConfigured,
  mediaPaths, uploadThumb,
} from "@/lib/media";
import { createPost } from "@/lib/posts";
import type { EnqueueItem } from "@/hooks/useUpload";
import { useAuthorName } from "./AuthorNameProvider";
import type { MediaItem } from "@/types";

type Picked = {
  id: string;
  file: File;
  previewUrl: string;
  isVideo: boolean;
  compressing: boolean;
  error?: string;
  compressed?: Blob;
  width?: number;
  height?: number;
};

export function Composer({
  user,
  tags,
  onUploadOriginals,
}: {
  user: User;
  tags: string[];
  onUploadOriginals: (items: EnqueueItem[]) => void;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const available = useMemo(
    () => TAG_DEFS.filter((t) => t.selectable && tags.includes(t.id)),
    [tags],
  );
  const [selected, setSelected] = useState<string[]>(() =>
    tags.includes("all") ? ["all"] : tags.slice(0, 1),
  );

  const authorNameVal = useAuthorName();
  const storageReady = isStorageConfigured();

  // プレビュー用の objectURL を確実に解放する
  useEffect(() => {
    return () => picked.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setError(null);

    const room = MAX_MEDIA_PER_POST - picked.length;
    const incoming = Array.from(files).slice(0, room);
    if (fileRef.current) fileRef.current.value = "";

    const drafts: Picked[] = incoming.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      isVideo: file.type.startsWith("video/"),
      compressing: !file.type.startsWith("video/"),
    }));
    setPicked((p) => [...p, ...drafts]);

    // 選んだ直後に圧縮まで済ませておく。投稿ボタンを押した時点で
    // 待ち時間がほぼゼロになり「送れた感」が出る。
    for (const d of drafts) {
      if (d.isVideo) {
        if (d.file.size > MAX_ORIGINAL_BYTES) {
          setPicked((p) => p.map((x) => x.id === d.id
            ? { ...x, compressing: false, error: "動画は60MBまでです" } : x));
        }
        continue;
      }
      try {
        const { blob, width, height } = await compressForTimeline(d.file);
        setPicked((p) => p.map((x) => x.id === d.id
          ? { ...x, compressing: false, compressed: blob, width, height } : x));
      } catch {
        setPicked((p) => p.map((x) => x.id === d.id
          ? { ...x, compressing: false, error: "画像を処理できませんでした" } : x));
      }
    }
  }

  function remove(id: string) {
    setPicked((p) => {
      const target = p.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return p.filter((x) => x.id !== id);
    });
  }

  function toggleTag(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const preparing = picked.some((p) => p.compressing);
  const hasError = picked.some((p) => p.error);
  const canSubmit =
    !busy && !preparing && !hasError && selected.length > 0 &&
    (text.trim().length > 0 || picked.length > 0);

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    try {
      // --- 第1段: 軽量版だけを先に上げる ---
      const media: MediaItem[] = [];
      const originals: EnqueueItem[] = [];

      for (const p of picked) {
        const ext = extOf(p.file);
        const id = crypto.randomUUID();
        const paths = mediaPaths(user.uid, id, ext);

        if (p.isVideo) {
          // 動画は圧縮せず1段階で送る
          const url = await uploadThumb(paths.original, p.file, p.file.type);
          media.push({
            type: "video", url, storagePath: paths.original, alt: p.file.name,
          });
          continue;
        }

        const url = await uploadThumb(paths.thumb, p.compressed ?? p.file);
        media.push({
          type: "image",
          url,
          storagePath: paths.thumb,
          width: p.width,
          height: p.height,
          alt: p.file.name,
          originalStatus: "pending",
        });
        originals.push({
          postId: "",              // createPost 後に埋める
          thumbPath: paths.thumb,
          originalPath: paths.original,
          fileName: p.file.name,
          bytes: p.file.size,
          file: p.file,
        });
      }

      const postRef = await createPost({
        uid: user.uid,
        displayName: authorNameVal,
        photoURL: user.photoURL,
        text,
        media,
        visibleToTags: selected,
      });

      // --- 顔検出の発火。★絶対に await しない★ ---
      void (async () => {
        try {
          await fetch("/api/faces/detect", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${await user.getIdToken()}`,
            },
            body: JSON.stringify({ postId: postRef.id }),
          });
        } catch {
          /* 失敗しても投稿体験には影響させない */
        }
      })();

      // --- 第2段: 原本はページ側のキューに委ねる ---
      if (originals.length > 0) {
        onUploadOriginals(originals.map((o) => ({ ...o, postId: postRef.id })));
      }

      picked.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setText("");
      setPicked([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "投稿に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="おふたりへのメッセージや、当日の写真をどうぞ 🌿"
        className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50/50 p-3 text-[15px] leading-relaxed text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-300 focus:bg-white"
      />

      {picked.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {picked.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-stone-100">
              {p.isVideo ? (
                <video src={p.previewUrl} muted playsInline className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
              )}

              {p.compressing && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
                </div>
              )}
              {p.error && (
                <div className="absolute inset-0 flex items-center justify-center bg-rose-50/90 p-1 text-center text-[10px] leading-tight text-rose-700">
                  {p.error}
                </div>
              )}

              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label="削除"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-xs text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-stone-500">
          公開範囲
          <span className="ml-1.5 font-normal text-stone-400">
            {selected.length > 0
              ? `${selected.map((t) => tagDef(t).label).join("・")} に表示されます`
              : "1つ以上選んでください"}
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {available.map((t) => {
            const on = selected.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
                aria-pressed={on}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
                  on ? t.className : "bg-white text-stone-400 ring-stone-200 hover:bg-stone-50"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => void onPick(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || !storageReady || picked.length >= MAX_MEDIA_PER_POST}
            title={storageReady ? undefined : "Storage バケットが未設定です"}
            className="rounded-full px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-50 disabled:opacity-40"
          >
            📷 写真・動画
            {picked.length > 0 && (
              <span className="ml-1 tabular-nums text-xs text-stone-400">
                {picked.length}/{MAX_MEDIA_PER_POST}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={!canSubmit}
          className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
        >
          {busy ? "送信中…" : preparing ? "準備中…" : "投稿する"}
        </button>
      </div>
    </div>
  );
}
