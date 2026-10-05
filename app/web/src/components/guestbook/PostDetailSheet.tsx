"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { prefersReducedMotion } from "@/hooks/useSwipe";
import {
  MOTION_EASING,
  SHEET_COLLAPSE_MS,
  SHEET_EXPAND_MS,
  postPath,
} from "@/config/guestbook";
import { PostDetail } from "./PostDetail";

/** カードの角丸（rounded-2xl）。展開の始まりと収縮の終わりをカードの形に合わせる */
const CARD_RADIUS_PX = 16;

/** タップされたカードの位置。シートはここから広がる */
let origin: { id: string; rect: DOMRect } | null = null;

/**
 * タイムラインの投稿カードから詳細シートを開く。
 *
 * ★ページ遷移ではなく history.pushState で URL だけを変える★
 *   ルートの layout が全ページを動的に描画する（CSP の nonce のため）ので、
 *   router.push や Intercepting Routes ではタップのたびにサーバーへの往復が入り、
 *   展開が始まるまで待たされる。投稿はすでに GuestbookDataProvider にあるため、
 *   タイムラインのページがその場でシートを重ねる（/guestbook/page.tsx が URL を見て出す）。
 *   pushState は Next.js の router と連動するので、戻る操作でシートが閉じ、
 *   URL の共有やリロードでは詳細画面（posts/[id]/page.tsx）が開く。
 * ★タイムラインのページの中でだけ呼ぶ★ シートを出すのはそのページだけ。
 */
export function openPostSheet(id: string, rect: DOMRect) {
  origin = { id, rect };
  window.history.pushState(null, "", postPath(id));
}

function takeOrigin(id: string): DOMRect | null {
  const o = origin;
  origin = null;
  return o && o.id === id ? o.rect : null;
}

/** 画面（シートの箱）の中で rect の部分だけを見せる clip-path */
function clipTo(rect: DOMRect, box: HTMLElement): string {
  const w = box.clientWidth;
  const h = box.clientHeight;
  const top = Math.max(0, rect.top);
  const left = Math.max(0, rect.left);
  const right = Math.max(0, w - rect.right);
  const bottom = Math.max(0, h - rect.bottom);
  return `inset(${top}px ${right}px ${bottom}px ${left}px round ${CARD_RADIUS_PX}px)`;
}
const CLIP_FULL = "inset(0px 0px 0px 0px round 0px)";

/** シートの中の詳細カード（無ければ中身の先頭） */
function detailCard(content: HTMLElement): HTMLElement {
  return content.querySelector<HTMLElement>("[data-post-detail]") ?? content;
}

/** タイムライン上の、その投稿のカード（画面内に見えているときだけ） */
function timelineCard(id: string): DOMRect | null {
  const el = document.querySelector<HTMLElement>(`[data-post-card="${CSS.escape(id)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight ? r : null;
}

/**
 * タイムラインの上に重ねる投稿の詳細。
 *
 * ★カードがそのまま広がって詳細になる★
 *   シート全体を clip-path でカードの位置・大きさに切り抜き、中身はカードの位置へずらした
 *   状態から始めて、両方を同時に全画面へ戻す。文字を拡大縮小しないので、展開中も滲まない。
 *   動かすのは clip-path と transform だけ（レイアウトを動かすと LINE 内ブラウザでカクつく）。
 * ★閉じるのは「戻る」「右スワイプ」「Esc」「端末の戻る操作」★ どれも履歴を1つ戻すだけで、
 *   シートは URL が /guestbook に戻ったときにページ側が外す。
 */
export function PostDetailSheet({ id, user }: { id: string; user: User }) {
  const router = useRouter();
  const sheet = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  // 裏のタイムラインを止める。PullToRefresh もこれを見て引っ張りを始めない
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheet.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 描く前に始まりの形にしておく（カードの位置に一瞬だけ全画面が見えるのを防ぐ）
  useLayoutEffect(() => {
    const box = sheet.current;
    const inner = content.current;
    const from = takeOrigin(id);
    if (!box || !inner || prefersReducedMotion()) return;

    const timing = { duration: SHEET_EXPAND_MS, easing: MOTION_EASING };
    if (!from) {
      // 通知や「進む」で開いたときは元のカードが無いので、右から差し込む
      box.animate(
        [{ transform: "translate3d(100%, 0, 0)" }, { transform: "none" }],
        timing,
      );
      return;
    }
    const to = detailCard(inner).getBoundingClientRect();
    box.animate([{ clipPath: clipTo(from, box) }, { clipPath: CLIP_FULL }], timing);
    inner.animate(
      [
        { transform: `translate3d(${from.left - to.left}px, ${from.top - to.top}px, 0)` },
        { transform: "none" },
      ],
      timing,
    );
  }, [id]);

  const back = useCallback(() => router.back(), [router]);

  /** 「戻る」ボタンと Esc: タイムラインのカードへ縮んでから戻る */
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const box = sheet.current;
    const inner = content.current;
    const to = timelineCard(id);
    if (!box || !inner || prefersReducedMotion()) {
      back();
      return;
    }
    const timing = {
      duration: SHEET_COLLAPSE_MS,
      easing: MOTION_EASING,
      fill: "forwards" as const,
    };
    if (!to) {
      box.animate(
        [{ transform: "none" }, { transform: "translate3d(100%, 0, 0)" }],
        timing,
      ).onfinish = back;
      return;
    }
    const from = detailCard(inner).getBoundingClientRect();
    box.animate([{ clipPath: CLIP_FULL }, { clipPath: clipTo(to, box) }], timing).onfinish = back;
    inner.animate(
      [
        { transform: "none" },
        { transform: `translate3d(${to.left - from.left}px, ${to.top - from.top}px, 0)` },
      ],
      timing,
    );
  }, [id, back]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // 写真ビューアが開いているときの Esc はビューアが受け取る（捕捉段階で preventDefault する）
      if (e.key === "Escape" && !e.defaultPrevented) close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useSwipeBack(
    sheet,
    sheet,
    () => {
      closing.current = true;
      back();
    },
    {
      // ★シートの先頭で下へ引く操作を止める★ シートは自前でスクロールするため
      //   PullToRefresh の守りが効かず、LINE の iOS 版ではブラウザごと閉じてしまう。
      blockNative: (axis, d) => axis === "y" && d > 0 && (sheet.current?.scrollTop ?? 0) <= 0,
    },
  );

  return (
    <div
      ref={sheet}
      role="dialog"
      aria-modal="true"
      aria-label="投稿の詳細"
      tabIndex={-1}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-stone-50 outline-none"
      style={{ touchAction: "pan-y" }}
    >
      <div
        ref={content}
        className="mx-auto max-w-xl px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))]"
      >
        <PostDetail id={id} user={user} onBack={close} />
      </div>
    </div>
  );
}
