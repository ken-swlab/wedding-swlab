"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { GuestbookShell } from "@/components/guestbook/GuestbookShell";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { useGuestbookData } from "@/components/guestbook/GuestbookDataProvider";
import { AuthorAvatar } from "@/components/guestbook/AuthorAvatar";
import { PostCard } from "@/components/guestbook/PostCard";
import { RichText } from "@/components/guestbook/RichText";
import { usePost } from "@/hooks/usePost";
import { markNotificationsRead, useMentionedComment, useNotifications } from "@/hooks/useNotifications";
import { useAuthorProfile } from "@/lib/profiles-client";
import { postPath } from "@/config/guestbook";
import { commentAnchorId } from "@/config/mentions";
import type { AppNotification, Comment } from "@/types";

function shortTime(n: AppNotification): string {
  if (!n.createdAt) return "";
  const d = n.createdAt.toDate();
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  if (min < 1440) return `${Math.floor(min / 60)}時間前`;
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 通知（Issue #92）。自分あての @メンションを新しい順に並べ、元の投稿・コメントをその場に出す。
 *
 * ★画面に出した通知は、まとめて既読にする★（read を true にする更新だけが Rules で許されている）
 *   既読にするとボトムナビの数字が減る。この画面を開いている間は、開いたときに未読だった行に
 *   目印を残す（既読にした瞬間に目印が消えると、どれが新しいのか分からない）。
 * ★元の投稿・コメントが読めないときは「この投稿は表示できません」だけを出す★
 *   削除・非表示・公開範囲の外を区別しない。通知そのものには本文を持たせていない。
 */
export default function NotificationsPage() {
  const { user } = useGuestSessionContext();
  const uid = user?.uid ?? null;
  const { notifications, loading, loadingMore, hasMore, loadMore, error } = useNotifications(uid);

  // 開いたときに未読だった通知。描画中に足す（effect で setState しない）
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
  if (unreadIds.some((id) => !fresh.has(id))) setFresh(new Set([...fresh, ...unreadIds]));

  const unreadKey = unreadIds.join(",");
  useEffect(() => {
    if (!uid || !unreadKey) return;
    markNotificationsRead(uid, unreadKey.split(",")).catch((e) => console.error(e));
  }, [uid, unreadKey]);

  return (
    <GuestbookShell>
      <h1 className="mb-3 font-serif text-xl tracking-wide text-stone-900">通知</h1>
      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-stone-200/60" />
          ))}
        </div>
      ) : error && notifications.length === 0 ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
          お知らせを読み込めませんでした。時間をおいて、もう一度お試しください。
        </p>
      ) : notifications.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-400">
          まだお知らせはありません
        </p>
      ) : (
        <ul className="space-y-5">
          {notifications.map((n) => (
            <li key={n.id}>{user && <NotificationRow notification={n} user={user} unread={fresh.has(n.id)} />}</li>
          ))}
          {hasMore && (
            <li>
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="min-h-11 w-full touch-manipulation rounded-full border border-stone-200 bg-white text-sm text-stone-500 transition hover:bg-stone-100 disabled:opacity-50"
              >
                {loadingMore ? "読み込み中…" : "もっと見る"}
              </button>
            </li>
          )}
        </ul>
      )}
    </GuestbookShell>
  );
}

function NotificationRow({
  notification: n,
  user,
  unread,
}: {
  notification: AppNotification;
  user: User;
  unread: boolean;
}) {
  // 名前とアイコンは最新を出す（通知に保存した名前は、通知を作ったときのもの）
  const sender = useAuthorProfile(n.fromUid, { name: n.fromName });

  return (
    <article>
      <header className="mb-2 flex items-center gap-2.5 px-1">
        <AuthorAvatar uid={n.fromUid} profile={sender} className="h-8 w-8" sizes="32px" />
        <p className="min-w-0 flex-1 break-words text-sm leading-snug text-stone-700">
          <span className="font-semibold text-stone-900">{sender.name}</span>
          さんがあなたをメンションしました
        </p>
        <time className="shrink-0 whitespace-nowrap text-xs tabular-nums text-stone-400">{shortTime(n)}</time>
        {unread && (
          <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            新着
          </span>
        )}
      </header>
      <MentionSource notification={n} user={user} />
    </article>
  );
}

/** 通知の元になった投稿・コメント。投稿はタイムラインと同じカード、コメントは投稿の詳細のそのコメントへ送る */
function MentionSource({ notification: n, user }: { notification: AppNotification; user: User }) {
  // 一覧にある投稿はそれを使い、無いときだけ1件を購読する（PostDetail と同じ）
  const { posts } = useGuestbookData();
  const cached = posts.find((p) => p.id === n.postId) ?? null;
  const remote = usePost(n.postId, !cached);
  const post = cached ?? remote.post;
  // 自分の投稿は非表示でも読めるが、ここでは出さない
  const visible = !!post && post.status === "visible";
  const mentioned = useMentionedComment(n.postId, n.commentId, visible);

  if ((!cached && remote.loading) || mentioned.loading) {
    return <div className="h-24 animate-pulse rounded-2xl bg-stone-200/60" />;
  }
  if (!post || !visible || (n.commentId && !mentioned.comment)) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-400">
        この投稿は表示できません
      </p>
    );
  }
  if (n.commentId && mentioned.comment) {
    return <CommentPreview postId={n.postId} comment={mentioned.comment} />;
  }
  // ★openAs="page"★ 詳細シートを出せるのは /guestbook だけ（PostCard の★参照）
  return <PostCard post={post} user={user} openAs="page" />;
}

function CommentPreview({ postId, comment }: { postId: string; comment: Comment }) {
  const author = useAuthorProfile(comment.authorUid, { name: comment.authorName, photoURL: comment.authorPhotoURL });
  return (
    <Link
      href={`${postPath(postId)}#${commentAnchorId(comment.id)}`}
      className="block touch-manipulation rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm transition hover:bg-stone-50"
    >
      <p className="text-[11px] font-medium text-stone-400">コメント</p>
      <p className="mt-1 truncate text-[13px] font-semibold text-stone-800">{author.name}</p>
      <RichText
        text={comment.text}
        mentionNames={comment.mentions}
        className="mt-0.5 block whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-700"
      />
      <p className="mt-2 text-xs text-stone-400">タップして投稿とコメントを開く</p>
    </Link>
  );
}
