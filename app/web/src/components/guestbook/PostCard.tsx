"use client";

import Link from "next/link";
import { useRef, useState, type MouseEvent } from "react";
import type { User } from "firebase/auth";
import type { Post } from "@/types";
import { toggleReaction } from "@/lib/posts";
import { useMyReaction } from "@/hooks/useMyReaction";
import { COMMENT_INPUT_ID, postPath } from "@/config/guestbook";
import { MediaGrid } from "./MediaGrid";
import { TagBadge } from "./TagBadge";
import { RichText } from "./RichText";
import { openPostSheet } from "./PostDetailSheet";
import { AuthorAvatar } from "./AuthorAvatar";
import { useAuthorProfile } from "@/lib/profiles-client";

function relativeTime(post: Post): string {
  if (!post.createdAt) return "送信中…";
  const d = post.createdAt.toDate();
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  if (min < 1440) return `${Math.floor(min / 60)}時間前`;
  return d.toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
}

/** カードのタップで詳細へ行かない要素。ここに当たったタップはその要素自身の操作 */
const INTERACTIVE = "a, button, input, textarea, select, label, video";

/**
 * 投稿カード。
 *   - timeline: カードの余白・本文のタップで、カードがそのまま広がって詳細シートになる
 *     （PostDetailSheet）。写真のタップは写真ビューア（MediaLightbox）。
 *     コメントは件数だけを出す（購読は詳細画面でだけ張る）。
 *     ★timeline はタイムラインのページ（/guestbook）でだけ使う★ シートを出すのはそのページだけ。
 *   - detail: 詳細画面用。画面の端から端まで広げ、カード自体は遷移しない。
 *     いいねとコメントはアイコンと数字だけ。コメントの一覧と入力欄は PostDetail が下に出す。
 */
export function PostCard({
  post,
  user,
  variant = "timeline",
}: {
  post: Post;
  user: User;
  variant?: "timeline" | "detail";
}) {
  const card = useRef<HTMLElement>(null);
  const detail = variant === "detail";
  const href = postPath(post.id);
  // 名前とアイコンは最新を出す（投稿に保存した値は投稿したときのもの。profiles-client の★参照）
  const author = useAuthorProfile(post.authorUid, { name: post.authorName, photoURL: post.authorPhotoURL });

  // ★いいね済みかの読み取りは詳細画面でだけ行う★（useMyReaction のコメント参照）
  //   タイムラインは従来どおり白ハートから始める。
  const [localReacted, setLocalReacted] = useState(false);
  const mine = useMyReaction(post.id, user.uid, detail);
  const reacted = detail ? mine.reacted : localReacted;
  const setReacted = detail ? mine.setReacted : setLocalReacted;
  const [busy, setBusy] = useState(false);

  function onCardClick(e: MouseEvent<HTMLElement>) {
    if (detail || e.defaultPrevented) return;
    if ((e.target as Element).closest(INTERACTIVE)) return;
    // 本文を長押しで選択した直後のタップでは遷移しない（コピーしたいだけのため）
    if (window.getSelection()?.toString()) return;
    openDetail();
  }

  function openDetail() {
    if (card.current) openPostSheet(post.id, card.current.getBoundingClientRect());
  }

  /** 時刻・コメントのリンク。新しいタブで開く操作だけはブラウザに任せる */
  function onLinkClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    openDetail();
  }

  async function onReact() {
    if (busy || (detail && !mine.loaded)) return;
    setBusy(true);
    try {
      setReacted(await toggleReaction(post.id, user.uid));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      ref={card}
      onClick={onCardClick}
      // シートはここから広がり（PostDetailSheet）、閉じるときはここへ縮む
      data-post-card={detail ? undefined : post.id}
      data-post-detail={detail ? "" : undefined}
      className={
        detail
          ? "bg-white p-4"
          : "cursor-pointer touch-manipulation rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm"
      }
    >
      <header className="flex items-start gap-3">
        <AuthorAvatar uid={post.authorUid} profile={author} className="h-10 w-10" sizes="40px" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-semibold text-stone-900">{author.name}</p>
            {detail ? (
              <time className="shrink-0 text-xs text-stone-400">{relativeTime(post)}</time>
            ) : (
              // キーボードや読み上げでも詳細へ行けるよう、時刻をリンクにしておく
              <Link href={href} onClick={onLinkClick} className="shrink-0 text-xs text-stone-400 hover:underline">
                <time>{relativeTime(post)}</time>
              </Link>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {post.visibleToTags.map((t) => <TagBadge key={t} id={t} />)}
          </div>
        </div>
      </header>

      {post.text && (
        <RichText
          text={post.text}
          className="selectable mt-3 block whitespace-pre-wrap break-words text-[15px] leading-relaxed text-stone-800"
        />
      )}

      {/*
        ★写真まわりのクリックをカードに伝えない★
          MediaLightbox は body 直下（portal）に全画面で出るが、React のイベントは DOM ではなく
          コンポーネントの木をたどって伝わる。ここで止めないと、ライトボックス内の
          操作（閉じる・送る）までカードのクリックになり、詳細画面へ飛んでしまう。
      */}
      <div onClick={(e) => e.stopPropagation()}>
        <MediaGrid post={post} />
      </div>

      <footer className="mt-3 border-t border-stone-100 pt-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void onReact();
            }}
            disabled={busy}
            aria-pressed={reacted}
            aria-label={`いいね ${post.reactionCount}件`}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition disabled:opacity-50 ${
              reacted ? "bg-rose-50 text-rose-600" : "text-stone-500 hover:bg-stone-50"
            }`}
          >
            <span aria-hidden>{reacted ? "❤️" : "🤍"}</span>
            <span className="tabular-nums">{post.reactionCount}</span>
          </button>
          {detail ? (
            // 押すと画面下のコメント入力欄にフォーカスする（タップの処理の中で呼ぶので iOS でもキーボードが開く）
            <button
              type="button"
              onClick={() => document.getElementById(COMMENT_INPUT_ID)?.focus()}
              aria-label={`コメント ${post.commentCount}件。コメントを書く`}
              className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-full px-3 text-sm text-stone-500 transition hover:bg-stone-50"
            >
              <span aria-hidden>💬</span>
              <span aria-hidden className="tabular-nums">{post.commentCount}</span>
            </button>
          ) : (
            <Link
              href={href}
              onClick={onLinkClick}
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-stone-500 transition hover:bg-stone-50"
            >
              💬 {post.commentCount > 0 ? `コメント ${post.commentCount}件` : "コメントする"}
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}
