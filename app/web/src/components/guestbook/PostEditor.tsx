"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { compressForTimeline } from "@/lib/image";
import {
  MAX_MEDIA_PER_POST, MAX_ORIGINAL_BYTES, extOf, isStorageConfigured,
  reserveOriginalKey, uploadThumb, uploadVideo,
} from "@/lib/media";
import { thumbSrc } from "@/lib/media-url";
import { updatePost, type EditedMedia } from "@/lib/posts";
import { MAX_POST_LENGTH } from "@/lib/text";
import type { ReencodedJpeg } from "@/lib/thumb-guard";
import type { EnqueueItem } from "@/hooks/useUpload";
import { useGuestbookUpload } from "./GuestbookDataProvider";
import { TagBadge } from "./TagBadge";
import type { MediaItem, Post } from "@/types";

/** 編集で足した写真・動画（まだ送っていない） */
type Picked = {
  id: string;
  file: File;
  previewUrl: string;
  isVideo: boolean;
  compressing: boolean;
  error?: string;
  compressed?: ReencodedJpeg;
  width?: number;
  height?: number;
};

/** 送信済みの1件（保存の API だけ失敗してやり直すときに、同じ写真を二重に送らない） */
type Sent = { media: EditedMedia; original?: Omit<EnqueueItem, "postId"> };

/**
 * 自分の投稿の編集画面（全画面。Issue #94）。本文と写真・動画を変えられる。公開範囲は変えられない。
 *
 * ★保存を押すまで、足した写真を公開バケットへ送らない★ キャンセルしたときに、使われない画像を残さないため。
 *   保存でまとめてアップロードしてから API（/api/posts/[id]）を呼ぶ。
 * ★足した写真は、投稿のときと同じ流れで処理する★（Composer と同じ関数）
 *   軽量版は canvas で作り直したものだけを送る（compressForTimeline → uploadThumb。元の写真は GPS 入りのことがある）。
 *   原本はキーだけ確保し、端末の送信待ち（useUpload）に載せる。ブラウザで EXIF を処理しない。
 * ★残す写真は storagePath だけを送る★ 高画質版の状態などは、サーバーが保存済みの値をそのまま使う。
 * ★外した写真の R2 のデータは消さない★ 送信待ちに残っている原本だけ、キューから取り除く。
 * ★document.body へ Portal で出し、表示中は body を overflow: hidden にする★（PullToRefresh の★参照）
 */
export function PostEditor({
  post,
  user,
  onClose,
  onSaved,
}: {
  post: Post;
  user: User;
  onClose: () => void;
  /** 保存が済んだあとに呼ぶ（一覧の読み直し） */
  onSaved: () => void;
}) {
  const upload = useGuestbookUpload();
  const [text, setText] = useState(post.text);
  const [kept, setKept] = useState<MediaItem[]>(post.media);
  const [added, setAdded] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sent = useRef(new Map<string, Sent>());
  const previews = useRef<string[]>([]);

  const storageReady = isStorageConfigured();
  const total = kept.length + added.length;

  // 裏の画面を止める。PullToRefresh と useCompactChrome もこれを見る
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // プレビュー用の object URL は、画面を閉じるときにまとめて解放する
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.length = 0;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (!busy) onClose();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const incoming = Array.from(files).slice(0, MAX_MEDIA_PER_POST - total);
    if (fileRef.current) fileRef.current.value = "";

    const drafts: Picked[] = incoming.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previews.current.push(previewUrl);
      return {
        id: crypto.randomUUID(),
        file,
        previewUrl,
        isVideo: file.type.startsWith("video/"),
        compressing: !file.type.startsWith("video/"),
      };
    });
    setAdded((p) => [...p, ...drafts]);

    // 選んだ直後に圧縮まで済ませておく（Composer と同じ）。送るのは保存を押してから
    for (const d of drafts) {
      if (d.isVideo) {
        if (d.file.size > MAX_ORIGINAL_BYTES) {
          setAdded((p) => p.map((x) => (x.id === d.id ? { ...x, compressing: false, error: "動画は60MBまでです" } : x)));
        }
        continue;
      }
      try {
        const { blob, width, height } = await compressForTimeline(d.file);
        setAdded((p) => p.map((x) => (x.id === d.id ? { ...x, compressing: false, compressed: blob, width, height } : x)));
      } catch {
        setAdded((p) => p.map((x) => (x.id === d.id ? { ...x, compressing: false, error: "画像を処理できませんでした" } : x)));
      }
    }
  }

  const preparing = added.some((p) => p.compressing);
  const hasError = added.some((p) => p.error);
  const empty = !text.trim() && total === 0;
  const canSave = !busy && !preparing && !hasError && !empty;

  /** 足した1件を送る（すでに送ってあれば、その結果を使う） */
  async function send(p: Picked): Promise<Sent> {
    const done = sent.current.get(p.id);
    if (done) return done;

    const ext = extOf(p.file);
    let result: Sent;
    if (p.isVideo) {
      const v = await uploadVideo(p.file, ext);
      result = { media: { type: "video", storagePath: v.key, alt: p.file.name } };
    } else {
      // ★軽量版は必ず canvas で作り直したものだけを送る★（Composer の★参照。Issue #66）
      if (!p.compressed) throw new Error("写真の準備ができていません。写真を選び直してください");
      const t = await uploadThumb(p.compressed);
      const originalPath = await reserveOriginalKey(ext, p.file.type || "image/jpeg");
      result = {
        media: { type: "image", storagePath: t.key, width: p.width, height: p.height, alt: p.file.name, originalPath },
        original: { thumbPath: t.key, originalPath, fileName: p.file.name, bytes: p.file.size, file: p.file },
      };
    }
    sent.current.set(p.id, result);
    return result;
  }

  async function onSave() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const fresh: Sent[] = [];
      for (const p of added) fresh.push(await send(p));

      const res = await updatePost(post.id, {
        text,
        media: [...kept.map((m) => ({ type: m.type, storagePath: m.storagePath })), ...fresh.map((f) => f.media)],
      });

      // 外した写真の原本が送信待ちに残っていれば取り除く（送らない）
      const keptPaths = new Set(kept.map((m) => m.storagePath));
      const removed = post.media.map((m) => m.storagePath).filter((p) => !keptPaths.has(p));
      if (removed.length > 0) void upload.discard(post.id, removed);

      // 足した写真の原本は、投稿のときと同じく端末に保存するだけ（送信はゲストのボタン操作で）
      const originals = fresh.flatMap((f) => (f.original ? [{ ...f.original, postId: post.id }] : []));
      if (originals.length > 0) upload.enqueue(originals);

      // 足した写真の顔の検出。★待たない★（Composer と同じ。失敗しても編集には影響させない）
      if (res.detectFaces) {
        void (async () => {
          try {
            await fetch("/api/faces/detect", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${await user.getIdToken()}`,
              },
              body: JSON.stringify({ postId: post.id }),
            });
          } catch {
            /* 失敗しても編集は成立している */
          }
        })();
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
      setBusy(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="投稿の編集"
      // Portal の中のクリックも React の木ではカードへ伝わるので、ここで止める
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[70] flex flex-col bg-white"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-stone-200/80 px-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="min-h-11 touch-manipulation rounded-full px-4 text-sm text-stone-600 transition hover:bg-stone-100 disabled:opacity-40"
        >
          キャンセル
        </button>
        <h2 className="text-sm font-semibold text-stone-900">投稿を編集</h2>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!canSave}
          className="my-1.5 min-h-11 touch-manipulation rounded-full bg-stone-900 px-5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
        >
          {busy ? "保存中…" : preparing ? "準備中…" : "保存"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
          {/* iOS は 16px 未満の入力欄でフォーカス時に拡大するので text-base にする */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={MAX_POST_LENGTH}
            aria-label="本文"
            className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50/50 p-3 text-base leading-relaxed text-stone-800 outline-none focus:border-stone-300 focus:bg-white"
          />
          <p className="mt-1 text-right text-xs tabular-nums text-stone-400">
            {text.length} / {MAX_POST_LENGTH}
          </p>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {kept.map((m) => (
              <div key={m.storagePath} className="relative aspect-square overflow-hidden rounded-xl bg-stone-100">
                {m.type === "video" ? (
                  <video src={thumbSrc(m)} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  <Image src={thumbSrc(m)} alt="" fill sizes="25vw" className="object-cover" />
                )}
                <RemoveButton
                  disabled={busy}
                  onClick={() => setKept((list) => list.filter((x) => x.storagePath !== m.storagePath))}
                />
              </div>
            ))}
            {added.map((p) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-stone-100">
                {p.isVideo ? (
                  <video src={p.previewUrl} muted playsInline className="h-full w-full object-cover" />
                ) : (
                  // 端末の中の画像（blob:）のプレビュー。next/image を通す意味がないので <img> を使う（Composer と同じ）
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
                <RemoveButton
                  disabled={busy}
                  onClick={() => {
                    sent.current.delete(p.id);
                    setAdded((list) => list.filter((x) => x.id !== p.id));
                  }}
                />
              </div>
            ))}
          </div>

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
            disabled={busy || !storageReady || total >= MAX_MEDIA_PER_POST}
            className="mt-3 min-h-11 touch-manipulation rounded-full border border-stone-200 px-4 text-sm text-stone-600 transition hover:bg-stone-100 disabled:opacity-40"
          >
            📷 写真・動画を追加
            <span className="ml-1 tabular-nums text-xs text-stone-400">
              {total}/{MAX_MEDIA_PER_POST}
            </span>
          </button>

          <div className="mt-5 rounded-xl bg-stone-50 p-3">
            <p className="text-xs font-medium text-stone-500">公開範囲</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {post.visibleToTags.map((t) => (
                <TagBadge key={t} id={t} />
              ))}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-stone-500">公開範囲は変更できません。</p>
          </div>

          {empty && <p className="mt-3 text-sm text-amber-700">本文か写真のどちらかは必要です</p>}
          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 写真を外す「×」。見た目は小さく、当たり判定だけ広げる（Composer と同じ） */
function RemoveButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="この写真を外す"
      className="absolute right-0 top-0 flex h-11 w-11 touch-manipulation items-start justify-end p-1 text-white disabled:opacity-40"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-xs transition active:bg-black/80">
        ×
      </span>
    </button>
  );
}
