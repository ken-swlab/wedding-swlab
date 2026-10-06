"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SpaceSwitch } from "@/components/guestbook/SpaceSwitch";
import { GUIDE_PATHS } from "@/config/guide";

/**
 * also: タブには無いが、そのタブの中の画面として扱うパス（開いている間そのタブを濃くする）。
 * アンケート（出欠・アレルギー）はご案内のトップから開く。
 */
const NAV: { key: string; label: string; icon: string; href: string | null; also?: string[] }[] = [
  { key: "home", label: "ご案内", icon: "✉", href: GUIDE_PATHS.home, also: [GUIDE_PATHS.questionnaire] },
  { key: "guests", label: "出席者・座席", icon: "◎", href: GUIDE_PATHS.guests },
  { key: "payment", label: "ご祝儀", icon: "¥", href: GUIDE_PATHS.payment },
  // まだ画面が無い。押せないタブとして「予定」を見せる
  { key: "ai", label: "ミニAI", icon: "✦", href: null },
];

/**
 * 案内モード（/guide 以下）で共通の枠: 上に左上のロゴ（空間の切り替え）と見出し、下に固定のタブ。
 * ゲストブックの枠（GuestbookShell）と違い、検索・投稿・引っ張って更新・全画面表示は持たない。
 *
 * ★本文の下余白はボトムナビの高さ＋safe-area 分を必ず空ける★（GuestbookShell と同じ理由）
 */
export function GuideShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
          <SpaceSwitch current="guide" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-stone-600">ご案内・各種手続き</p>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4">{children}</main>
      <GuideNav />
    </div>
  );
}

function GuideNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="ご案内のメニュー"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex h-16 max-w-xl">
        {NAV.map((item) => {
          const tab = "flex h-full touch-manipulation flex-col items-center justify-center gap-0.5 text-[11px] font-medium";
          if (!item.href) {
            return (
              <li key={item.key} className="flex-1">
                <span aria-disabled="true" className={`${tab} text-stone-300`}>
                  <span aria-hidden className="text-lg leading-none">{item.icon}</span>
                  <span>
                    {item.label}
                    <span className="ml-0.5 text-[9px]">（予定）</span>
                  </span>
                </span>
              </li>
            );
          }
          const on = pathname === item.href || (item.also?.includes(pathname) ?? false);
          // 中の画面からタブを押したらトップへ戻れるよう、リンクは同じページのときだけ「表示中」にする
          const here = pathname === item.href;
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={here ? "page" : undefined}
                className={`${tab} transition ${on ? "text-stone-900" : "text-stone-400 hover:text-stone-600"}`}
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
