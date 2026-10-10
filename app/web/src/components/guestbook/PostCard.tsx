"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useGuestSessionContext } from "./GuestSessionContext";
import { postJson } from "@/lib/api-client";
import { useAuthorProfile } from "@/lib/profiles-client";

function relativeTime(post: Post): string {
  if (!post.createdAt) return "送信中…";
  const d = post.createdAt.toDate();
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  if (min < 1440) return `${Math.floor(min / 60)}時間前`;
  // 「10/9 18:25」「1/2 9:05」。月・日・時はゼロ埋めせず、分だけ 2 桁にする（Issue #79）
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** カードのタップで詳細へ行かない要素。ここに当たったタップはその要素自身の操作 */
const INTERACTIVE = "a, button, input, textarea, select, label, video";

/**
 * 投稿カード。
 *   - timeline: カードの余白・本文のタップで、カードがそのまま広がって詳細シートになる
 *     （PostDetailSheet）。写真のタップは写真ビューア（MediaLightbox）。
 *     コメントは件数だけを出す（購読は詳細画面でだけ張る）。
 *     ★シートを出すのはタイムラインのページ（/guestbook）だけ★ ほかのページ（マイページ）で
 *     timeline の見た目を使うときは openAs="page" を渡し、詳細画面（posts/[id]）へ遷移させる。
 *     渡さないと URL だけが変わって何も開かない（PostDetailSheet の openPostSheet の★参照）。
 *   - detail: 詳細画面用。画面の端から端まで広げ、カード自体は遷移しない。
 *     いいねとコメントはアイコンと数字だけ。コメントの一覧と入力欄は PostDetail が下に出す。
 */
export function PostCard({
  post,
  user,
  variant = "timeline",
  openAs = "sheet",
}: {
  post: Post;
  user: User;
  variant?: "timeline" | "detail";
  openAs?: "sheet" | "page";
}) {
  const router = useRouter();
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
  const { isAdmin } = useGuestSessionContext();
  const [hiding, setHiding] = useState(false);
  const hidden = post.status === "hidden";

  function onCardClick(e: MouseEvent<HTMLElement>) {
    if (detail || e.defaultPrevented) return;
    if ((e.target as Element).closest(INTERACTIVE)) return;
    // 本文を長押しで選択した直後のタップでは遷移しない（コピーしたいだけのため）
    if (window.getSelection()?.toString()) return;
    openDetail();
  }

  function openDetail() {
    if (openAs === "page") router.push(href);
    else if (card.current) openPostSheet(post.id, card.current.getBoundingClientRect());
  }

  /** 時刻・コメントのリンク。新しいタブで開く操作だけはブラウザに任せる */
  function onLinkClick(e: MouseEvent<HTMLAnchorElement>) {
    // 詳細画面へ遷移するときは Link に任せる
    if (openAs === "page") return;
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

  /** 管理者: 投稿とそのコメントを非表示にする（/api/admin/posts/visibility。戻すのは管理画面から） */
  async function onHide() {
    if (hiding) return;
    if (!confirm("この投稿とコメントを非表示にします。ほかのゲストと会場のスクリーンから消えます。よろしいですか？")) return;
    setHiding(true);
    try {
      await postJson("/api/admin/posts/visibility", { postId: post.id, hidden: true });
    } catch (e) {
      alert(e instanceof Error ? e.message : "非表示にできませんでした");
    } finally {
      setHiding(false);
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
      {/* 非表示の投稿は投稿者本人にだけ届く（usePost / Rules）。何が起きたかを伝える */}
      {hidden && (
        <p role="status" className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          この投稿は新郎新婦が非表示にしました。ほかのゲストと会場のスクリーンには表示されません。
        </p>
      )}
      <header className="flex items-start gap-3">
        <AuthorAvatar uid={post.authorUid} profile={author} className="h-10 w-10" sizes="40px" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-semibold text-stone-900">{author.name}</p>
            {detail ? (
              <time className="shrink-0 whitespace-nowrap text-xs tabular-nums text-stone-400">{relativeTime(post)}</time>
            ) : (
              // キーボードや読み上げでも詳細へ行けるよう、時刻をリンクにしておく
              <Link href={href} onClick={onLinkClick} className="shrink-0 whitespace-nowrap text-xs tabular-nums text-stone-400 hover:underline">
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
        {detail && isAdmin && !hidden && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => void onHide()}
              disabled={hiding}
              className="min-h-11 touch-manipulation rounded-full px-3 text-xs text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
            >
              {hiding ? "非表示にしています…" : "非表示にする（管理者）"}
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}
