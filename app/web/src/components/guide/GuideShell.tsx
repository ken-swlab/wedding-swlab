"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useHistoryFloor } from "@/hooks/useHistoryOverlay";
import { SpaceSwitch } from "@/components/guestbook/SpaceSwitch";
import { GUIDE_PATHS } from "@/config/guide";
import { useTags } from "@/lib/tags-client";
import { useOptionalGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { EnvelopeIcon, SeatIcon, SparkleIcon, YenIcon } from "@/components/icons";

/**
 * also: タブには無いが、そのタブの中の画面として扱うパス（開いている間そのタブを濃くする）。
 * アンケート（出欠・アレルギー）はご案内のトップから開く。
 */
// アイコンは線のアイコン（components/icons.tsx。Issue #227）
const NAV: { key: string; label: string; icon: ReactNode; href: string | null; also?: string[] }[] = [
  { key: "home", label: "ご案内", icon: <EnvelopeIcon />, href: GUIDE_PATHS.home, also: [GUIDE_PATHS.questionnaire, GUIDE_PATHS.details] },
  { key: "guests", label: "座席", icon: <SeatIcon />, href: GUIDE_PATHS.guests },
  { key: "payment", label: "会費", icon: <YenIcon />, href: GUIDE_PATHS.payment },
  // まだ画面が無い。押せないタブとして「予定」を見せる
  { key: "ai", label: "ミニAI", icon: <SparkleIcon />, href: null },
];

/**
 * 案内モード（/guide 以下）で共通の枠: 上に左上のロゴ（空間の切り替え）と見出し、下に固定のタブ。
 * ゲストブックの枠（GuestbookShell）と違い、検索・投稿・引っ張って更新・全画面表示は持たない。
 *
 * ★本文の下余白はボトムナビの高さ＋safe-area 分を必ず空ける★（GuestbookShell と同じ理由）
 */
export function GuideShell({ children }: { children: ReactNode }) {
  // ★タグの辞書の購読をここでも始める★（Issue #231。GuestbookShell と同じ。購読は1本のまま）
  useTags();
  // ★タブの画面では、戻る（左端のスワイプ）で招待状やログインの画面へ行かない★（Issue #273。useHistoryFloor）
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const tabRoot = NAV.some((item) => item.href === pathname);
  useHistoryFloor(tabRoot, search ? `${pathname}?${search}` : pathname);
  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-stone-50/94 pt-[env(safe-area-inset-top)] backdrop-blur">
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
  // ★親族用から入った人には「会費」を出さない★（Issue #243。会費は手渡し。ご案内・座席・ミニAI の3つ）
  const items = useOptionalGuestSessionContext()?.invitationKind === "family" ? NAV.filter((item) => item.key !== "payment") : NAV;
  return (
    <nav
      aria-label="ご案内のメニュー"
      // 地は紙の色の半透明・境目は罫線 1px（Issue #236。ゲストブックの下のタブと同じ）
      className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-stone-50/94 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex h-16 max-w-xl">
        {items.map((item) => {
          const tab = "flex h-full touch-manipulation flex-col items-center justify-center gap-0.5 text-[length:calc(11px*var(--inv-scale))]";
          if (!item.href) {
            return (
              <li key={item.key} className="flex-1">
                <span aria-disabled="true" className={`${tab} text-stone-300`}>
                  <span aria-hidden className="flex h-5 items-center">{item.icon}</span>
                  <span>
                    {item.label}
                    <span className="ml-0.5 text-[length:calc(9px*var(--inv-scale))]">（予定）</span>
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
                // ★タブの切り替えは履歴に積まない★（Issue #273。左端のスワイプで前のタブに戻らない）
                replace
                aria-current={here ? "page" : undefined}
                // 選んでいるタブは墨の太字（Issue #236）
                className={`${tab} transition ${on ? "font-bold text-stone-900" : "text-stone-400 hover:text-stone-600"}`}
              >
                <span aria-hidden className="flex h-5 items-center">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
