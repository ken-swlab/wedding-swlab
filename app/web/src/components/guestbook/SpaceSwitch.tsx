"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOptionalGuestSessionContext } from "./GuestSessionContext";
import { prefersReducedMotion } from "@/hooks/useSwipe";
import { GALLERY_ENABLED, GUESTBOOK_LOGO, GUESTBOOK_PATHS, MOTION_EASING, SHEET_EXPAND_MS } from "@/config/guestbook";
import { INVITATION_COLORS } from "@/config/invitation";
import { GUIDE_PATHS, type AppSpace } from "@/config/guide";
import { ChevronDownIcon, ClipboardIcon, CrownIcon, FlowerIcon } from "@/components/icons";

// アイコンは線のアイコン（components/icons.tsx。Issue #227）
const SPACES: { key: AppSpace; icon: ReactNode; label: string; sub: string; href: string }[] = [
  {
    key: "guestbook",
    icon: <FlowerIcon className="h-6 w-6" />,
    label: "SNS・写真共有",
    // ギャラリーを出さない間（Issue #270）は説明からも外す（管理者にも同じ文言。説明だけなので出し分けない）
    sub: GALLERY_ENABLED ? "タイムライン・ギャラリー" : "タイムライン・コミュニティ",
    href: GUESTBOOK_PATHS.home,
  },
  {
    key: "guide",
    icon: <ClipboardIcon className="h-6 w-6" />,
    label: "ご案内・各種手続き",
    sub: "当日のご案内・座席・会費",
    href: GUIDE_PATHS.home,
  },
];

/**
 * 左上のロゴ（グローバルスイッチ）。押すと下からシートが出て、SNS と案内の空間を行き来する。
 * 管理者にはシートの一番下に管理画面へのリンクも出す（表示だけの出し分け。守りは /admin 側の判定）。
 *
 * notice: シートに添える注意（ゲストブックで高画質版を送信中のときなど）。
 * current が "admin" のときは管理画面（/admin）に置いている。(guest) の外なので、セッションの Context は無い。
 */
export function SpaceSwitch({ current, notice }: { current: AppSpace | "admin"; notice?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${GUESTBOOK_LOGO.left}${GUESTBOOK_LOGO.amp}${GUESTBOOK_LOGO.right}。画面を切り替える`}
        // 左右の余白は 4px（px-1）。「GB」より幅が広いので、iPhone SE（幅 320px）でも検索欄を 160px 以上残すため詰めた（Issue #226）
        className="flex h-11 shrink-0 touch-manipulation items-center gap-0.5 rounded-full px-1 text-stone-900 transition hover:bg-stone-100"
      >
        {/* ロゴ「H&K」（Issue #226）。明朝 500・21px。「&」だけ金で 0.85em、左右に 1px。縦の位置は H・K の並びのまま */}
        <span aria-hidden className="font-serif text-[length:calc(21px*var(--inv-scale))] font-medium leading-none tracking-[0.06em] text-stone-900">
          {GUESTBOOK_LOGO.left}
          <span style={{ color: INVITATION_COLORS.gold, fontSize: "0.85em", margin: "0 1px" }}>{GUESTBOOK_LOGO.amp}</span>
          {GUESTBOOK_LOGO.right}
        </span>
        <ChevronDownIcon className="h-3 w-3 text-stone-400" />
      </button>
      {open && <SpaceSheet current={current} notice={notice} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * ★document.body へ Portal で出す★ ヘッダーは全画面表示のとき pointer-events-none になり、本文は引っ張って更新の間
 *   transform が付く（PullToRefresh の★参照）。その中に置くと押せない・画面に固定されないことがある。
 */
function SpaceSheet({
  current,
  notice,
  onClose,
}: {
  current: AppSpace | "admin";
  notice?: string;
  onClose: () => void;
}) {
  const session = useOptionalGuestSessionContext();
  // 管理画面では、開けている時点で管理者（判定は /admin 側。ここは表示だけ）
  const isAdmin = current === "admin" || session?.isAdmin === true;
  const panel = useRef<HTMLDivElement>(null);

  // 裏の画面を止める。PullToRefresh もこれを見て引っ張りを始めない
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // 下からせり上がる。描く前に始まりの位置へ置く（一瞬だけ最終位置が見えるのを防ぐ）
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el || prefersReducedMotion()) return;
    el.animate([{ transform: "translate3d(0, 100%, 0)" }, { transform: "none" }], {
      duration: SHEET_EXPAND_MS,
      easing: MOTION_EASING,
    });
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="画面の切り替え"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
    >
      <div
        ref={panel}
        className="w-full max-w-xl rounded-t-2xl bg-white px-4 pt-3 shadow-xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-200" />
        <ul className="flex flex-col gap-2">
          {SPACES.map((s) => {
            const here = s.key === current;
            return (
              <li key={s.key}>
                <Link
                  href={s.href}
                  onClick={onClose}
                  aria-current={here ? "page" : undefined}
                  className={`flex min-h-16 touch-manipulation items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                    here ? "border-stone-900 bg-stone-50" : "border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  <span aria-hidden className="flex text-stone-700">{s.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[length:calc(15px*var(--inv-scale))] font-semibold text-stone-900">{s.label}</span>
                    <span className="block text-xs text-stone-500">{s.sub}</span>
                  </span>
                  {here && <span className="shrink-0 text-xs text-stone-500">表示中</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        {notice && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900" role="note">
            {notice}
          </p>
        )}

        {isAdmin && (
          <Link
            href="/admin"
            onClick={onClose}
            aria-current={current === "admin" ? "page" : undefined}
            className="mt-3 flex min-h-[var(--inv-tap)] touch-manipulation items-center justify-center gap-1.5 rounded-full text-xs text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
          >
            <CrownIcon className="h-4 w-4" />管理者画面{current === "admin" && "（表示中）"}
          </Link>
        )}
      </div>
    </div>,
    document.body,
  );
}
