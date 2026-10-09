"use client";

import { useRef } from "react";
import type { User } from "firebase/auth";
import { COMMENT_INPUT_ID } from "@/config/guestbook";
import { CharCount, useCommentForm } from "./CommentArea";
import type { Post } from "@/types";

/**
 * 投稿の詳細画面の一番下に固定するコメント入力欄（「コメントを追加…」）。
 * 置き場所は詳細の枠（flex の縦並び）の最後。枠は useVisualViewportFrame で
 * キーボードの上までに縮むので、この欄はいつもキーボードのすぐ上に来る。
 *
 * ★閉じているときも本物の textarea を置く（ボタンにしない）★
 *   iOS はタップの処理の中で focus しないとキーボードを出さない。ボタンを押してから
 *   textarea を描いて focus しても、キーボードが開かない。
 * ★フォーカスしただけでは欄の形を変えない（行数・送信ボタン・下の余白）★
 *   キーボードが上がるのと同時に欄の高さや余白が変わると、OS のアニメーションと
 *   枠の位置合わせ（useVisualViewportFrame）が重なって画面がガタつく（Issue #78）。
 *   送信ボタンは常に出しておき、広げるのは文字を入れ始めてから（キーボードが上がりきった後）にする。
 * ★背景は不透明の白にし、欄の下にも白を伸ばす★
 *   キーボードが開くと枠はキーボードの上までに縮み、枠の下（キーボードと iOS の「^ v 完了」バーの裏）には
 *   裏の画面（タイムラインなど）が残る。バーは半透明なので、そのままだと写真や文字が透けて崩れて見える。
 *   欄の下に画面の高さ分の白を付けておけば、枠と一緒に動き（右スワイプで戻るときも）、裏を隠せる。
 *   fixed ではなく absolute にする（枠は transform で動くので、中の fixed は使えない。useSwipeBack の★参照）。
 * ★enterkeyhint は付けない★ 複数行のコメントなので改行キーは改行のまま。「送信」表示にすると押しても
 *   改行になり紛らわしい。iOS の「^ v 完了」バーは enterkeyhint や inputmode では消せない。
 * ★文字の大きさは 16px 以上★ それより小さいと iOS がフォーカス時に画面を拡大し、
 *   枠の位置合わせ（visualViewport）が拡大中の扱いになって崩れる。
 */
export function CommentBar({ post, user, onSent }: { post: Post; user: User; onSent?: () => void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const { text, setText, busy, formError, count, over, near, canSend, onSubmit } = useCommentForm(
    post,
    user,
    () => {
      // 送ったらキーボードを閉じ、一覧の最後（いま送ったコメント）を見せる
      input.current?.blur();
      onSent?.();
    },
  );
  const expanded = text.length > 0;

  return (
    <form
      onSubmit={onSubmit}
      // 下の余白はキーボードの開閉で変えない（★参照）
      className="relative z-10 shrink-0 border-t border-stone-200/80 bg-white px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2"
    >
      {/* キーボードの裏を隠す白（★参照） */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-lvh bg-white" />
      <div className="mx-auto max-w-xl">
        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            id={COMMENT_INPUT_ID}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={expanded ? 3 : 1}
            aria-label="コメント"
            placeholder="コメントを追加…"
            className="min-h-11 flex-1 touch-manipulation resize-none rounded-[1.375rem] border border-transparent bg-stone-100 px-4 py-2.5 text-base leading-snug text-stone-800 outline-none placeholder:text-stone-500 focus:border-stone-300 focus:bg-white"
          />
          <button
            type="submit"
            disabled={!canSend}
            // textarea のフォーカスを外さずに送る（外れるとキーボードが閉じてから送ることになる）
            onPointerDown={(e) => e.preventDefault()}
            className="min-h-11 shrink-0 touch-manipulation rounded-full bg-stone-900 px-4 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
          >
            {busy ? "送信中…" : "送信"}
          </button>
        </div>
        {expanded && (
          <div className="mt-1 flex items-center justify-between gap-3 px-2">
            <CharCount count={count} over={over} near={near} />
            {formError ? (
              <span role="alert" className="text-xs text-rose-600">
                {formError}
              </span>
            ) : (
              <span className="text-xs text-stone-400">#タグ や @名前 が使えます</span>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
