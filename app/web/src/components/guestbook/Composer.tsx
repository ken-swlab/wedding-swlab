"use client";

import { useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { TAG_DEFS } from "@/config/tags";
import { createPost } from "@/lib/posts";
import { isStorageConfigured, uploadMedia } from "@/lib/media";
import type { MediaItem } from "@/types";

export function Composer({ user, tags }: { user: User; tags: string[] }) {
  const [text, setText] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 自分が持つタグにしか投稿できない（Rules 側でも同じ制約をかけている）
  const available = useMemo(
    () => TAG_DEFS.filter((t) => t.selectable && tags.includes(t.id)),
    [tags],
  );
  const [selected, setSelected] = useState<string[]>(() =>
    tags.includes("all") ? ["all"] : tags.slice(0, 1),
  );

  const storageReady = isStorageConfigured();
  const name = user.displayName ?? "ゲスト";

  function toggleTag(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const picked = Array.from(files).slice(0, 4 - media.length);
      const uploaded = await Promise.all(picked.map((f) => uploadMedia(f, user.uid)));
      setMedia((m) => [...m, ...uploaded].slice(0, 4));
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await createPost({
        uid: user.uid,
        displayName: name,
        photoURL: user.photoURL,
        text,
        media,
        visibleToTags: selected,
      });
      setText("");
      setMedia([]);
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

      {media.length > 0 && (
        <p className="mt-2 text-xs text-stone-500">
          添付 {media.length} / 4 件
          <button
            type="button"
            onClick={() => setMedia([])}
            className="ml-2 underline hover:text-stone-700"
          >
            クリア
          </button>
        </p>
      )}

      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-stone-500">公開範囲</p>
        <div className="flex flex-wrap gap-1.5">
          {available.map((t) => {
            const on = selected.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
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
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || !storageReady || media.length >= 4}
            title={storageReady ? undefined : "Storage バケットが未作成です"}
            className="rounded-full px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-50 disabled:opacity-40"
          >
            📷 写真・動画
          </button>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || selected.length === 0 || (!text.trim() && media.length === 0)}
          className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
        >
          {busy ? "送信中…" : "投稿する"}
        </button>
      </div>
    </div>
  );
}
