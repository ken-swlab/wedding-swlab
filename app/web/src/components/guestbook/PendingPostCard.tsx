"use client";

import { useMemo, useSyncExternalStore } from "react";
import { displayVisibleTags } from "@/config/tags";
import { previewPost } from "@/lib/post-draft";
import { useAuthorProfile } from "@/lib/profiles-client";
import type { OutboxEntry } from "@/hooks/usePostOutbox";
import { MediaGrid } from "./MediaGrid";
import { TagBadge } from "./TagBadge";
import { RichText } from "./RichText";
import { AuthorAvatar } from "./AuthorAvatar";
import { HeartIcon } from "./HeartIcon";
import { CommentIcon } from "@/components/icons";

/**
 * 送信中の自分の投稿（Issue #254）。普通の投稿（PostCard）と同じ見た目で、タイムラインの一番上に出す。
 *
 * ★写真は端末の中のもの★（URL.createObjectURL）。通信しないので、押した瞬間に出る。
 * ★いいね・コメント・写真のビューアは押せない★（薄く出す）。投稿のデータがまだ無いので、押しても書けない。
 * ★PostCard を使わない★ PostCard は自分のいいねを読む（useMyReaction）。まだ無い投稿を読みに行かない。
 * 送れなかったら「送れませんでした」と「もう一度送る」「取り消す」を出す。勝手には消さない。
 * 書けたあと（sent）は、本物の写真を読み込み終わるまで、この見た目のまま「送信中…」だけを外す。
 */
export function PendingPostCard({
  entry,
  onRetry,
  onCancel,
}: {
  entry: OutboxEntry;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const post = useMemo(() => previewPost(entry.draft), [entry.draft]);
  const author = useAuthorProfile(post.authorUid, { name: post.authorName, photoURL: post.authorPhotoURL });
  const failed = entry.status === "failed";
  const online = useOnline();
  const sending = entry.status === "sending";
  // 進み具合。0 のままだと線が見えないので、少しだけ出しておく
  const ratio = Math.max(0.06, Math.min(1, entry.done / Math.max(1, entry.total)));

  return (
    <article
      data-pending-post={post.id}
      aria-busy={sending}
      // PostCard の timeline と同じ余白・罫線（Issue #236）
      className="relative -mx-4 border-b border-stone-200 px-4 py-[18px]"
    >
      <header className="flex items-start gap-3">
        <AuthorAvatar uid={post.authorUid} profile={author} className="h-10 w-10" sizes="40px" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-semibold text-stone-900">{author.name}</p>
            {!failed && <span className="shrink-0 whitespace-nowrap text-xs text-stone-400">たった今</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {displayVisibleTags(post.visibleToTags).map((t) => <TagBadge key={t} id={t} />)}
          </div>
        </div>
        {sending && (
          // 右上に小さく「送信中…」と、細い進み具合の線
          <div role="status" className="shrink-0 pt-0.5 text-right">
            <span className="text-xs text-stone-500">送信中…</span>
            <span aria-hidden="true" className="mt-1 block h-0.5 w-16 overflow-hidden rounded-full bg-stone-200">
              {/* 進み具合は style で渡す（この部品はタップのあとでだけ描くので、サーバーの HTML には入らない） */}
              <span
                className="block h-full origin-left rounded-full bg-stone-500 transition-transform duration-300 ease-out"
                style={{ transform: `scaleX(${ratio})` }}
              />
            </span>
          </div>
        )}
      </header>

      {/* ★投稿のデータの書き込みは、電波が無いと待ち続ける★（Firestore が自分で送り直す。端末にも残る）。
          「送れませんでした」にはならないので、待っていることだけを知らせる */}
      {sending && !online && (
        <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          電波がありません。電波が戻ると、続きを送ります。
        </p>
      )}

      {failed && (
        <div role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-800">
          <p className="font-semibold">送れませんでした</p>
          {/* 理由（ブラウザの英語のメッセージなど）は出さない。詳しくは console に残している（usePostOutbox） */}
          <p className="mt-0.5">電波が戻ると、自動でもう一度送ります。</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="min-h-[var(--inv-tap)] touch-manipulation rounded-full bg-stone-900 px-4 text-sm font-semibold text-white hover:bg-stone-700"
            >
              もう一度送る
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("この投稿を取り消しますか？（書いた内容と写真は消えます）")) onCancel();
              }}
              className="min-h-[var(--inv-tap)] touch-manipulation rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-600 hover:bg-stone-100"
            >
              取り消す
            </button>
          </div>
        </div>
      )}

      {post.text && (
        <RichText
          text={post.text}
          mentionNames={post.mentions}
          className="selectable mt-3 block whitespace-pre-wrap break-words text-[length:calc(15px*var(--inv-scale))] leading-relaxed text-stone-800"
        />
      )}

      {/* 写真は見せるだけ（ビューアは開かない。送信が終わってから） */}
      <div className="pointer-events-none">
        <MediaGrid post={post} />
      </div>

      {/* いいね・コメントは、送信が終わるまで押せない（薄く出す） */}
      <footer className="mt-2 opacity-40" aria-hidden="true">
        <div className="flex items-center gap-1">
          <span className="inline-flex min-h-[var(--inv-tap)] items-center gap-1.5 px-3 text-sm text-stone-500">
            <HeartIcon filled={false} />
            <span className="tabular-nums">0</span>
          </span>
          <span className="inline-flex min-h-[var(--inv-tap)] items-center gap-1.5 px-3 text-sm text-stone-500">
            <CommentIcon className="h-[18px] w-[18px]" />
            <span>コメントする</span>
          </span>
        </div>
      </footer>
    </article>
  );
}

/** 端末がネットにつながっているか（navigator.onLine。つながっていても届かないことはある） */
function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
