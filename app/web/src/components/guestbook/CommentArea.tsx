"use client";

import { useRef, useState, type FormEvent, type RefObject } from "react";
import type { User } from "firebase/auth";
import { useComments } from "@/hooks/useComments";
import { createComment, deleteComment } from "@/lib/comments";
import { countChars, MAX_COMMENT_LENGTH } from "@/lib/text";
import { useAuthorName } from "./AuthorNameProvider";
import { RichText } from "./RichText";
import { AuthorAvatar } from "./AuthorAvatar";
import { useGuestSessionContext } from "./GuestSessionContext";
import { MentionSuggestions } from "./MentionSuggestions";
import { useAuthorProfile } from "@/lib/profiles-client";
import { postJson } from "@/lib/api-client";
import { useMentionInput } from "@/hooks/useMentionInput";
import { MENTION_NOTIFY_API, commentAnchorId } from "@/config/mentions";
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
  const author = useAuthorProfile(comment.authorUid, { name: comment.authorName, photoURL: comment.authorPhotoURL });

  return (
    <li id={commentAnchorId(comment.id)} className="flex scroll-mt-4 gap-2.5 py-2.5">
      <AuthorAvatar uid={comment.authorUid} profile={author} className="mt-0.5 h-7 w-7" sizes="28px" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-semibold text-stone-800">
            {author.name}
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
          mentionNames={comment.mentions}
          className="selectable mt-0.5 block whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-700"
        />
        {/* 親の投稿が非表示になったコメントは、書いた本人（と投稿者・管理者）にだけ届く */}
        {comment.hidden && (
          <p className="mt-1 text-[11px] text-amber-700">このコメントは非表示になりました（投稿が非表示になったため）</p>
        )}
      </div>
    </li>
  );
}

/** コメントの一覧（読み込み中・失敗の表示を含む）。購読は呼び出し側の useComments が持つ */
export function CommentList({
  post,
  user,
  comments,
  loading,
  error,
}: {
  post: Post;
  user: User;
} & Pick<ReturnType<typeof useComments>, "comments" | "loading" | "error">) {
  if (error) {
    return (
      <p className="py-3 text-sm text-rose-600">
        コメントを読み込めませんでした（{error.code}）
      </p>
    );
  }
  if (loading && comments.length === 0) {
    return <p className="py-3 text-sm text-stone-400">読み込み中…</p>;
  }
  return (
    <ul className="divide-y divide-stone-100">
      {comments.map((c) => (
        <CommentRow key={c.id} comment={c} post={post} uid={user.uid} />
      ))}
    </ul>
  );
}

/**
 * コメントの入力と送信（文字数の上限・送信中・失敗の状態と、@メンションの候補を持つ）。
 * 呼び出し側は、返した input を textarea の ref に、mention.track を onChange / onSelect / onFocus に付ける。
 * textarea の ref を呼び出し側でも使うときは inputRef で渡す。
 */
export function useCommentForm(
  post: Post,
  user: User,
  onSent?: () => void,
  inputRef?: RefObject<HTMLTextAreaElement | null>,
) {
  const authorName = useAuthorName();
  // アイコンは本人が設定したもの（guests.photoURL）。Auth の photoURL は LINE の画像のまま
  const authorPhotoURL = useGuestSessionContext().profile?.photoURL || user.photoURL;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const ownInput = useRef<HTMLTextAreaElement>(null);
  const input = inputRef ?? ownInput;
  // 候補は親の投稿が見える人だけ（コメントの公開範囲は親と同じ）。投稿の作者は、タグが重ならなくても読める
  const mention = useMentionInput({
    text,
    setText,
    input,
    selfUid: user.uid,
    visibleToTags: post.visibleToTags,
    alwaysUids: [post.authorUid],
  });

  const count = countChars(text);
  const over = count > MAX_COMMENT_LENGTH;
  const near = count > MAX_COMMENT_LENGTH * 0.9;
  const canSend = !busy && !over && !!text.trim();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;

    setBusy(true);
    setFormError(null);
    try {
      const mentioned = mention.mentioned;
      const commentId = await createComment({
        postId: post.id,
        postVisibleToTags: post.visibleToTags, // ★親と完全一致が必須★
        uid: user.uid,
        displayName: authorName,
        photoURL: authorPhotoURL,
        text,
        mentioned,
      });
      // ★通知は待たずに頼む★ 失敗してもコメントは成立している（/api/notifications/mention）
      if (mentioned.length > 0) {
        void postJson(MENTION_NOTIFY_API, { postId: post.id, commentId }).catch((err) => console.error(err));
      }
      setText("");
      mention.reset();
      onSent?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return { text, setText, busy, formError, count, over, near, canSend, onSubmit, input, mention };
}

/** 文字数の表示（上限の 9 割で amber、超えたら rose） */
export function CharCount({ count, over, near }: { count: number; over: boolean; near: boolean }) {
  return (
    <span
      aria-live="polite"
      className={`text-xs tabular-nums ${
        over ? "font-semibold text-rose-600" : near ? "text-amber-600" : "text-stone-400"
      }`}
    >
      {count}/{MAX_COMMENT_LENGTH}
    </span>
  );
}

/** 開閉できるコメント欄（写真ビューアの横で使う）。投稿の詳細画面は CommentList + CommentBar */
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
  const { text, setText, busy, formError, count, over, near, canSend, onSubmit, input, mention } = useCommentForm(post, user);

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
          <CommentList post={post} user={user} comments={comments} loading={loading} error={error} />

          <form onSubmit={onSubmit} className="relative mt-2">
            {/* 候補は入力欄の上に重ねる（下はキーボードに隠れる） */}
            <MentionSuggestions state={mention.suggestions} className="bottom-full mb-1" />
            <textarea
              ref={input}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                mention.track(e.currentTarget);
              }}
              onSelect={(e) => mention.track(e.currentTarget)}
              onFocus={(e) => mention.track(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Escape") mention.suggestions.close();
              }}
              rows={2}
              placeholder="コメントを追加…  #タグ や @名前 が使えます"
              className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50/50 p-2.5 text-sm leading-relaxed text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-300 focus:bg-white"
            />

            <div className="mt-1.5 flex items-center justify-between gap-3">
              <CharCount count={count} over={over} near={near} />

              <div className="flex items-center gap-3">
                {formError && <span className="text-xs text-rose-600">{formError}</span>}
                <button
                  type="submit"
                  disabled={!canSend}
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
