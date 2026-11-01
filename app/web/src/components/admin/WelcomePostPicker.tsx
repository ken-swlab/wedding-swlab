"use client";

import Image from "next/image";
import Link from "next/link";
import { thumbSrc } from "@/lib/media-url";
import { GUESTBOOK_PATHS } from "@/config/guestbook";
import type { WelcomePostOption } from "@/types/welcome";

/**
 * 承認後の写真（/admin/welcome。Issue #215）に使う投稿を選ぶシート。
 * 新郎新婦（couple タグの人）の投稿を、サムネイルの一覧から選ぶ。
 */
export function WelcomePostPicker({
  title,
  posts,
  current,
  warnOf,
  onPick,
  onReload,
  reloading,
  onClose,
}: {
  title: string;
  posts: WelcomePostOption[];
  current: string;
  /** 選んだときに出る警告（見えない投稿など）。無ければ null */
  warnOf: (p: WelcomePostOption) => string | null;
  /** "" は「未設定に戻す」 */
  onPick: (postId: string) => void;
  onReload: () => void;
  reloading: boolean;
  onClose: () => void;
}) {
  const list = posts.filter((p) => p.couple || p.id === current);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <header className="border-b border-stone-100 p-4">
          <h2 className="font-serif text-lg text-stone-900">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">新郎新婦の投稿（写真のあるもの）から選びます。</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {/* ★別のタブで開く★ この画面の未保存の変更を消さない。投稿したら「一覧を読み直す」 */}
            <Link href={GUESTBOOK_PATHS.home} target="_blank" rel="noopener" className="inline-flex min-h-11 touch-manipulation items-center rounded-full border border-stone-200 px-3 text-xs text-stone-600 hover:bg-stone-100">新しく投稿する →</Link>
            <button type="button" onClick={onReload} disabled={reloading} className="min-h-11 touch-manipulation rounded-full border border-stone-200 px-3 text-xs text-stone-600 hover:bg-stone-100 disabled:opacity-40">{reloading ? "読み込んでいます…" : "一覧を読み直す"}</button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {list.length === 0 ? (
            <p className="p-8 text-center text-xs leading-relaxed text-stone-400">新郎新婦の写真の投稿がありません。「新しく投稿する」から投稿してください。</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {list.map((p) => {
                const warn = warnOf(p);
                const selected = p.id === current;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onPick(p.id)}
                      aria-pressed={selected}
                      className={`block w-full touch-manipulation overflow-hidden rounded-lg border text-left ${selected ? "border-stone-900 ring-2 ring-stone-900" : "border-stone-200"}`}
                    >
                      <span className="relative block aspect-square bg-stone-100">
                        <Image src={thumbSrc(p.media)} alt="" fill sizes="160px" className="object-cover" unoptimized />
                        {warn && <span className="absolute inset-x-0 bottom-0 bg-amber-500/90 px-1 py-0.5 text-[10px] leading-tight text-white">{warn}</span>}
                      </span>
                      <span className="block truncate px-1.5 py-1 text-[11px] text-stone-500">{p.text || "（本文なし）"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="flex gap-2 border-t border-stone-100 p-3">
          <button type="button" onClick={() => onPick("")} className="min-h-11 flex-1 touch-manipulation rounded-full border border-stone-200 text-sm text-stone-600 hover:bg-stone-50">未設定に戻す</button>
          <button type="button" onClick={onClose} className="min-h-11 flex-1 touch-manipulation rounded-full text-sm text-stone-500 hover:bg-stone-100">閉じる</button>
        </footer>
      </div>
    </div>
  );
}
