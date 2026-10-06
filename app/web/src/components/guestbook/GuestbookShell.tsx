"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useGuestbookUpload } from "./GuestbookDataProvider";
import { SearchBar } from "./SearchBar";
import { PullToRefresh } from "./PullToRefresh";
import { SpaceSwitch } from "./SpaceSwitch";
import { useBackdropLocation } from "@/hooks/useBackdropLocation";
import { useCompactChrome } from "@/hooks/useCompactChrome";
import {
  CHROME_MORPH_EASING,
  CHROME_MORPH_MS,
  COMPOSER_ANCHOR_ID,
  GUESTBOOK_PATHS,
  GUESTBOOK_SELECT_PARAM,
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
  { key: "settings", label: "マイページ", icon: "☺", href: GUESTBOOK_PATHS.settings },
];

/** /guestbook のクエリから表示中のビューを読む（詳細シートの表示中は開く前のビュー） */
export function useGuestbookView(): GuestbookView {
  const { params } = useBackdropLocation();
  return params.get(GUESTBOOK_VIEW_PARAM) === "gallery" ? "gallery" : "timeline";
}

/**
 * 保存する写真を選ぶモード（ギャラリーの ?select=1）に入る・抜ける URL。
 * 検索語（?q=）とビューは残す。顔の絞り込みは Context にあるので URL に関係なく残る。
 */
export function selectModeHref(params: URLSearchParams, on: boolean): string {
  const next = new URLSearchParams(params.toString());
  if (on) next.set(GUESTBOOK_SELECT_PARAM, "1");
  else next.delete(GUESTBOOK_SELECT_PARAM);
  const s = next.toString();
  return s ? `${GUESTBOOK_PATHS.home}?${s}` : GUESTBOOK_PATHS.home;
}

/**
 * ヘッダーとボトムナビを退避・復元するときの動き。曲線と時間は Shell の CSS 変数から読む。
 * linear() を解釈できない古い Safari では変数ごと無効になり、既定の ease で動く。
 * ★transform（translate / scale）と opacity だけを動かす★ レイアウトを動かすと LINE 内ブラウザでカクつく。
 *   Tailwind v4 の translate-* / scale-* は transform ではなく translate / scale プロパティに出るので、
 *   transition の対象もその名前で書く（transform と書くと動きが付かない）。
 */
export const CHROME_MOTION =
  "transition-[translate,scale,opacity] [transition-duration:var(--chrome-ms)] [transition-timing-function:var(--chrome-ease)] motion-reduce:transition-none";

/*
 * 全画面のときだけ効くクラスは group-data-[chrome=compact]/chrome: を付けて書く（Shell の data-chrome を見る）。
 * ★この接頭辞は変数で組み立てない★ Tailwind はソースの文字列をそのまま探すので、
 *   `${...}:scale-100` のように書くと CSS が作られず、全画面に切り替わらない。
 */

/**
 * /guestbook 以下で共通の枠: 上に検索バーと「＋」、下に固定のタブ。
 * 下へ読み進めている間はヘッダーを上へ隠し、ボトムナビを左下の丸いボタンに縮める（全画面表示）。
 * 少しでも上へ戻すと元に戻る（判定は useCompactChrome）。
 *
 * ★本文の下余白はボトムナビの高さ＋safe-area 分を必ず空ける★
 *   空けないと最後の投稿や「もっと見る」がナビの裏に隠れて押せない。
 * ★全画面のときも余白は変えない★
 *   ナビは fixed で本文に重なっているだけなので、余白はページ末尾にしか効かない。
 *   切り替えのたびに余白を変えるとページの高さが変わり、末尾ではスクロール位置が
 *   押し戻されて「上へ戻した」と判定され、縮む → 戻る を繰り返してガタつく。
 */
export function GuestbookShell({ children }: { children: ReactNode }) {
  const { pathname } = useBackdropLocation();
  const view = useGuestbookView();
  const { compact, expand } = useCompactChrome(`${pathname}:${view}`);
  const motion = { "--chrome-ms": `${CHROME_MORPH_MS}ms`, "--chrome-ease": CHROME_MORPH_EASING } as CSSProperties;

  return (
    <div className="group/chrome min-h-dvh bg-stone-50" data-chrome={compact ? "compact" : "full"} style={motion}>
      <Header compact={compact} />
      <UploadMiniStatus />
      <PullToRefresh>
        <main className="mx-auto max-w-xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4">
          {children}
        </main>
      </PullToRefresh>
      <BottomNav compact={compact} onExpand={expand} />
    </div>
  );
}

function Header({ compact }: { compact: boolean }) {
  const { pathname, params } = useBackdropLocation();
  const view = useGuestbookView();
  const gallery = pathname === GUESTBOOK_PATHS.home && view === "gallery";
  const selecting = gallery && params.get(GUESTBOOK_SELECT_PARAM) === "1";
  const { running } = useGuestbookUpload();
  return (
    <header
      inert={compact}
      className={`sticky top-0 z-40 border-b border-stone-200/80 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur ${CHROME_MOTION} group-data-[chrome=compact]/chrome:-translate-y-full`}
    >
      <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
        <SpaceSwitch
          current="guestbook"
          notice={
            running
              ? "高画質版を送信中です。ご案内へ移ると、いま送っている1枚のあとで送信が止まります。続きはゲストブックに戻ってから送れます。"
              : undefined
          }
        />
        <SearchBar />
        {/* ギャラリーでだけ出す。押すと保存する写真を選ぶモードに入る（もう一度押すと抜ける） */}
        {gallery && (
          <Link
            href={selectModeHref(params, !selecting)}
            replace={selecting}
            scroll={false}
            aria-label={selecting ? "写真の選択をやめる" : "写真を選んで保存する"}
            className={`flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border text-lg leading-none transition ${
              selecting
                ? "border-sky-600 bg-sky-600 text-white"
                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
            }`}
          >
            <span aria-hidden>⤓</span>
          </Link>
        )}
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
      className={`sticky top-[calc(3.5rem+1px+env(safe-area-inset-top))] z-30 block border-b border-sky-200 bg-sky-50/95 backdrop-blur ${CHROME_MOTION} group-data-[chrome=compact]/chrome:-translate-y-[calc(3.5rem+1px)]`}
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

function BottomNav({ compact, onExpand }: { compact: boolean; onExpand: () => void }) {
  const { pathname } = useBackdropLocation();
  const view = useGuestbookView();
  const active: NavKey =
    pathname === GUESTBOOK_PATHS.notifications
      ? "notifications"
      : pathname === GUESTBOOK_PATHS.settings
        ? "settings"
        : view;
  const current = NAV.find((item) => item.key === active) ?? NAV[0];

  return (
    <>
      {/*
        ★全画面のときは横長のナビを左下の丸いボタンへ吸い込むように縮め、inert にする★
          見えないナビのリンクにフォーカスやタップが届かないようにするため。
          縮む先（transform-origin）は丸いボタンの中心に合わせる。
      */}
      <nav
        aria-label="ゲストブックのメニュー"
        inert={compact}
        className={`fixed inset-x-0 bottom-0 z-40 origin-[2.75rem_calc(100%-2.75rem)] border-t border-stone-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur ${CHROME_MOTION} group-data-[chrome=compact]/chrome:pointer-events-none group-data-[chrome=compact]/chrome:scale-x-[0.14] group-data-[chrome=compact]/chrome:scale-y-[0.6] group-data-[chrome=compact]/chrome:opacity-0`}
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

      {/* 全画面のときだけ出る丸いボタン。押すと横長のナビに戻す（スクロール位置はそのまま） */}
      <button
        type="button"
        inert={!compact}
        onClick={onExpand}
        aria-label={`メニューを開く（いまは${current.label}）`}
        className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-40 flex h-14 w-14 touch-manipulation items-center justify-center rounded-full bg-stone-900/90 text-xl leading-none text-white shadow-lg backdrop-blur ${CHROME_MOTION} pointer-events-none scale-50 opacity-0 group-data-[chrome=compact]/chrome:pointer-events-auto group-data-[chrome=compact]/chrome:scale-100 group-data-[chrome=compact]/chrome:opacity-100`}
      >
        <span aria-hidden>{current.icon}</span>
      </button>
    </>
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
