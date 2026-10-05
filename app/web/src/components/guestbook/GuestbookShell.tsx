"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useGuestbookUpload } from "./GuestbookDataProvider";
import { SearchBar } from "./SearchBar";
import { PullToRefresh } from "./PullToRefresh";
import { useBackdropLocation } from "@/hooks/useBackdropLocation";
import {
  COMPOSER_ANCHOR_ID,
  GUESTBOOK_PATHS,
  GUESTBOOK_VIEW_PARAM,
  type GuestbookView,
} from "@/config/guestbook";

type NavKey = GuestbookView | "notifications" | "settings";

const NAV: { key: NavKey; label: string; icon: string; href: string }[] = [
  { key: "timeline", label: "タイムライン", icon: "☰", href: GUESTBOOK_PATHS.home },
  {
    key: "gallery",
    label: "ギャラリー",
    icon: "▦",
    href: `${GUESTBOOK_PATHS.home}?${GUESTBOOK_VIEW_PARAM}=gallery`,
  },
  { key: "notifications", label: "通知", icon: "♡", href: GUESTBOOK_PATHS.notifications },
  { key: "settings", label: "設定", icon: "⚙", href: GUESTBOOK_PATHS.settings },
];

/** /guestbook のクエリから表示中のビューを読む（詳細シートの表示中は開く前のビュー） */
export function useGuestbookView(): GuestbookView {
  const { params } = useBackdropLocation();
  return params.get(GUESTBOOK_VIEW_PARAM) === "gallery" ? "gallery" : "timeline";
}

/**
 * /guestbook 以下で共通の枠: 上に検索バーと「＋」、下に固定のタブ。
 *
 * ★本文の下余白はボトムナビの高さ＋safe-area 分を必ず空ける★
 *   空けないと最後の投稿や「もっと見る」がナビの裏に隠れて押せない。
 */
export function GuestbookShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-stone-50">
      <Header />
      <PullToRefresh />
      <UploadMiniStatus />
      <main className="mx-auto max-w-xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
        <span aria-hidden className="font-serif text-lg tracking-wide text-stone-900">GB</span>
        <SearchBar />
        <Link
          href={`${GUESTBOOK_PATHS.home}#${COMPOSER_ANCHOR_ID}`}
          aria-label="新しく投稿する"
          className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full bg-stone-900 text-2xl leading-none text-white transition hover:bg-stone-700"
        >
          <span aria-hidden>＋</span>
        </Link>
      </div>
    </header>
  );
}

/**
 * /guestbook 以外の画面（詳細・通知・設定）で、高画質版の送信中であることを出す。
 * /guestbook では UploadStatusBar が詳しく出すので、ここでは出さない。
 */
function UploadMiniStatus() {
  const { pathname } = useBackdropLocation();
  const { running, remaining, current } = useGuestbookUpload();
  if (!running || pathname === GUESTBOOK_PATHS.home) return null;

  const pct = Math.round((current?.progress ?? 0) * 100);
  return (
    <Link
      href={GUESTBOOK_PATHS.home}
      role="status"
      className="sticky top-[calc(3.5rem+1px+env(safe-area-inset-top))] z-30 block border-b border-sky-200 bg-sky-50/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-2 text-xs font-medium text-sky-900">
        <span className="shrink-0">高画質版を送信中… 残り {remaining} 枚</span>
        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sky-200">
          <span
            className="block h-full rounded-full bg-sky-600 transition-[width] duration-300"
            style={{ width: `${Math.max(3, pct)}%` }}
          />
        </span>
        <span className="shrink-0 tabular-nums">{pct}%</span>
      </div>
    </Link>
  );
}

function BottomNav() {
  const { pathname } = useBackdropLocation();
  const view = useGuestbookView();
  const active: NavKey =
    pathname === GUESTBOOK_PATHS.notifications
      ? "notifications"
      : pathname === GUESTBOOK_PATHS.settings
        ? "settings"
        : view;

  return (
    <nav
      aria-label="ゲストブックのメニュー"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex h-16 max-w-xl">
        {NAV.map((item) => {
          const on = active === item.key;
          // 詳細画面ではタイムラインを光らせるが、そこは「同じ画面」ではないので遷移させる
          const here = on && pathname === item.href.split("?")[0];
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={here ? "page" : undefined}
                onClick={(e) => {
                  if (!here) return;
                  // 表示中のタブをもう一度押したら先頭へ戻す（同じ URL への遷移はしない）
                  e.preventDefault();
                  scrollToTop();
                }}
                className={`flex h-full touch-manipulation flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                  on ? "text-stone-900" : "text-stone-400 hover:text-stone-600"
                }`}
              >
                <span aria-hidden className="text-lg leading-none">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function scrollToTop() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
}

/** 通知・設定など、まだ中身の無い画面の共通表示 */
export function PlaceholderPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200/80 bg-white p-6 text-center shadow-sm">
      <h1 className="font-serif text-xl tracking-wide text-stone-900">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-500">{children}</p>
    </section>
  );
}
