"use client";

import type { RefObject } from "react";
import type { User } from "firebase/auth";
import { usePost } from "@/hooks/usePost";
import { useComments } from "@/hooks/useComments";
import { prefersReducedMotion } from "@/hooks/useSwipe";
import { useGuestbookData } from "./GuestbookDataProvider";
import { PostCard } from "./PostCard";
import { PlaceholderPanel } from "./GuestbookShell";
import { CommentList } from "./CommentArea";
import { CommentBar } from "./CommentBar";

/**
 * 投稿の詳細（全画面。戻るボタンは出さない）。
 * 詳細画面（URL を直接開いたとき）と、タイムラインから開くシートの両方で使う。
 *
 * 呼び出し側は「position: fixed; top: 0; height: 100dvh」の縦並び（flex-col）の枠を用意し、
 * その中にこれを置く。上がスクロールする本文（投稿 → コメントの一覧）、下が固定のコメント入力欄。
 *
 * ★呼び出し側は、scroller の先頭で下へ引く操作を止める（useSwipeBack の blockNative）★
 *   scroller は自前でスクロールするので PullToRefresh の守りが効かず、
 *   LINE の iOS 版ではアプリ内ブラウザのシートごと閉じてしまう。
 * ★閉じる操作は右スワイプ・Esc・端末の戻る操作（見た目のボタンは置かない）★
 *   スワイプできない読み上げ（VoiceOver など）のために、見えない「閉じる」ボタンだけ残す。
 */
export function PostDetail({
  id,
  user,
  onClose,
  scroller,
  content,
}: {
  id: string;
  user: User;
  onClose: () => void;
  /** スクロールする箱。スワイプの判定とコメント送信後のスクロールに使う */
  scroller: RefObject<HTMLDivElement | null>;
  /** 中身（シートの開閉アニメーションで動かす） */
  content?: RefObject<HTMLDivElement | null>;
}) {
  // 一覧にある投稿はそれをすぐ出す（いいね数などはその購読で更新される）。
  // 共有 URL を直接開いたときのように一覧に無いときだけ、1件を購読する。
  const { posts } = useGuestbookData();
  const cached = posts.find((p) => p.id === id) ?? null;
  const remote = usePost(id, !cached);
  const post = cached ?? remote.post;
  const loading = !cached && remote.loading;

  const thread = useComments(id, !!post);

  function showLatest() {
    // コメントは古い順なので、いま送ったものは一番下。描き直しを待ってから送る
    requestAnimationFrame(() => {
      const el = scroller.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }

  return (
    <>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div ref={content} className="mx-auto max-w-xl pb-6 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={onClose}
            className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-[calc(0.75rem+env(safe-area-inset-top))] focus:z-10 focus:rounded-full focus:bg-stone-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
          >
            閉じる
          </button>

          {loading ? (
            <div data-post-detail className="h-40 animate-pulse bg-stone-200/60" />
          ) : post ? (
            <>
              <PostCard post={post} user={user} variant="detail" />
              {/* コメントは投稿のすぐ下に続けて並べる（開閉しない） */}
              <section aria-label="コメント" className="border-t border-stone-100 bg-white px-4 pb-2">
                {!thread.loading && !thread.error && thread.comments.length === 0 ? (
                  <p className="py-6 text-center text-sm text-stone-400">まだコメントはありません。</p>
                ) : (
                  <CommentList
                    post={post}
                    user={user}
                    comments={thread.comments}
                    loading={thread.loading}
                    error={thread.error}
                  />
                )}
              </section>
            </>
          ) : (
            <div data-post-detail className="px-4 pt-4">
              <PlaceholderPanel title="投稿が見つかりません">
                削除されたか、表示できない投稿です。
              </PlaceholderPanel>
            </div>
          )}
        </div>
      </div>

      {post && <CommentBar post={post} user={user} onSent={showLatest} />}
    </>
  );
}
