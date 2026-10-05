"use client";

import { useRef, useState } from "react";
import type { User } from "firebase/auth";
import { COMMENT_INPUT_ID } from "@/config/guestbook";
import { CharCount, useCommentForm } from "./CommentArea";
import type { Post } from "@/types";

/**
 * 投稿の詳細画面の一番下に固定するコメント入力欄（「＋ 会話に参加」）。
 * 置き場所は詳細の枠（flex の縦並び）の最後。枠は useVisualViewportFrame で
 * キーボードの上までに縮むので、この欄はいつもキーボードのすぐ上に来る。
 *
 * ★閉じているときも本物の textarea を置く（ボタンにしない）★
 *   iOS はタップの処理の中で focus しないとキーボードを出さない。ボタンを押してから
 *   textarea を描いて focus しても、キーボードが開かない。
 * ★文字の大きさは 16px 以上★ それより小さいと iOS がフォーカス時に画面を拡大し、
 *   枠の位置合わせ（visualViewport）が拡大中の扱いになって崩れる。
 */
export function CommentBar({ post, user, onSent }: { post: Post; user: User; onSent?: () => void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const { text, setText, busy, formError, count, over, near, canSend, onSubmit } = useCommentForm(
    post,
    user,
    () => {
      // 送ったらキーボードを閉じ、一覧の最後（いま送ったコメント）を見せる
      input.current?.blur();
      onSent?.();
    },
  );
  const expanded = focused || text.length > 0;

  return (
    <form
      onSubmit={onSubmit}
      // キーボードが開いている間はホームインジケーターが隠れるので、safe-area の余白は要らない
      className={`shrink-0 border-t border-stone-200/80 bg-white/95 px-3 pt-2 backdrop-blur ${
        focused ? "pb-2" : "pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
      }`}
    >
      <div className="mx-auto max-w-xl">
        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            id={COMMENT_INPUT_ID}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            rows={expanded ? 3 : 1}
            aria-label="コメント"
            placeholder={expanded ? "コメントを追加…  #タグ や @名前 が使えます" : "＋ 会話に参加"}
            className="min-h-11 flex-1 touch-manipulation resize-none rounded-[1.375rem] border border-transparent bg-stone-100 px-4 py-2.5 text-base leading-snug text-stone-800 outline-none placeholder:text-stone-500 focus:border-stone-300 focus:bg-white"
          />
          {expanded && (
            <button
              type="submit"
              disabled={!canSend}
              // textarea のフォーカスを外さずに送る（外れると欄が閉じてから送ることになる）
              onPointerDown={(e) => e.preventDefault()}
              className="min-h-11 shrink-0 touch-manipulation rounded-full bg-stone-900 px-4 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
            >
              {busy ? "送信中…" : "送信"}
            </button>
          )}
        </div>
        {expanded && (
          <div className="mt-1 flex items-center justify-between gap-3 px-2">
            <CharCount count={count} over={over} near={near} />
            {formError && (
              <span role="alert" className="text-xs text-rose-600">
                {formError}
              </span>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
