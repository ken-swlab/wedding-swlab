"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { useComments } from "@/hooks/useComments";
import { createComment, deleteComment } from "@/lib/comments";
import { countChars, MAX_COMMENT_LENGTH } from "@/lib/text";
import { RichText } from "./RichText";
import type { Comment, Post } from "@/types";

function shortTime(c: Comment): string {
  if (!c.createdAt) return "送信中…";
  const d = c.createdAt.toDate();
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  if (min < 1440) return `${Math.floor(min / 60)}時間前`;
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function CommentRow({ comment, post, uid }: { comment: Comment; post: Post; uid: string }) {
  const mine = comment.authorUid === uid;

  return (
    <li className="flex gap-2.5 py-2.5">
      <div className="relative mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full bg-stone-200">
        {comment.authorPhotoURL && (
          <Image src={comment.authorPhotoURL} alt="" fill sizes="28px" className="object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-semibold text-stone-800">
            {comment.authorName}
          </span>
          <time className="shrink-0 text-[11px] text-stone-400">{shortTime(comment)}</time>
          {mine && (
            <button
              type="button"
              onClick={() => void deleteComment(post.id, comment.id)}
              className="ml-auto shrink-0 text-[11px] text-stone-300 hover:text-rose-500"
            >
              削除
            </button>
          )}
        </div>
        <RichText
          text={comment.text}
          className="mt-0.5 block whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-700"
        />
      </div>
    </li>
  );
}

export function CommentArea({
  post,
  user,
  defaultOpen = false,
}: {
  post: Post;
  user: User;
  /** ライトボックスなど、最初から展開したい場面で true */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { comments, loading, error } = useComments(post.id, open);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const count = countChars(text);
  const over = count > MAX_COMMENT_LENGTH;
  const near = count > MAX_COMMENT_LENGTH * 0.9;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || over || !text.trim()) return;

    setBusy(true);
    setFormError(null);
    try {
      await createComment({
        postId: post.id,
        postVisibleToTags: post.visibleToTags, // ★親と完全一致が必須★
        uid: user.uid,
        displayName: user.displayName ?? "ゲスト",
        photoURL: user.photoURL,
        text,
      });
      setText("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full px-3 py-1.5 text-sm text-stone-500 transition hover:bg-stone-50"
      >
        💬 {post.commentCount > 0 ? `コメント ${post.commentCount}件` : "コメントする"}
      </button>

      {open && (
        <div className="mt-2 border-t border-stone-100 pt-1">
          {error ? (
            <p className="py-3 text-sm text-rose-600">
              コメントを読み込めませんでした（{error.code}）
            </p>
          ) : loading && comments.length === 0 ? (
            <p className="py-3 text-sm text-stone-400">読み込み中…</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {comments.map((c) => (
                <CommentRow key={c.id} comment={c} post={post} uid={user.uid} />
              ))}
            </ul>
          )}

          <form onSubmit={onSubmit} className="mt-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="コメントを追加…  #タグ や @名前 が使えます"
              className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50/50 p-2.5 text-sm leading-relaxed text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-300 focus:bg-white"
            />

            <div className="mt-1.5 flex items-center justify-between gap-3">
              <span
                aria-live="polite"
                className={`text-xs tabular-nums ${
                  over ? "font-semibold text-rose-600" : near ? "text-amber-600" : "text-stone-400"
                }`}
              >
                {count}/{MAX_COMMENT_LENGTH}
              </span>

              <div className="flex items-center gap-3">
                {formError && <span className="text-xs text-rose-600">{formError}</span>}
                <button
                  type="submit"
                  disabled={busy || over || !text.trim()}
                  className="rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
                >
                  {busy ? "送信中…" : "送信"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
