"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { EnqueueItem } from "@/hooks/useUpload";
import { useVisualViewportFrame } from "@/hooks/useVisualViewportFrame";
import { prefersReducedMotion } from "@/hooks/useSwipe";
import { publicName } from "@/lib/names";
import { COMPOSER_ANCHOR_ID, COMPOSER_TOAST_MS, GUESTBOOK_PATHS } from "@/config/guestbook";
import dynamic from "next/dynamic";
import type { ComposerNotice } from "./Composer";

/** ★投稿画面は開いたときに読む★（Issue #250。最初の JS を小さくする。「＋」を押した瞬間に読み込みを始める） */
const Composer = dynamic(() => import("./Composer").then((m) => m.Composer), { ssr: false });
import { AuthorNameProvider } from "./AuthorNameProvider";
import { useGuestSessionContext } from "./GuestSessionContext";
import { CameraIcon } from "@/components/icons";

type ComposerSheetApi = { open: () => void };

const ComposerSheetContext = createContext<ComposerSheetApi | null>(null);

type Toast = ComposerNotice & { id: number };

/**
 * 投稿画面（全画面のシート）を開く入口と、投稿したあとの知らせ（トースト）。Issue #224。
 * GuestbookDataProvider の中に1つだけ置く（/guestbook 以下のどのページの「＋」からでも開ける）。
 *
 * ★開くのは「＋」（GuestbookShell）・タイムラインの帯（ComposerStrip）・/guestbook#composer の URL★
 *   URL で来たときは開いたあと #composer を URL から消す（戻る・再読み込みで何度も開かないように）。
 * ★閉じても元のスクロール位置のまま★ シートはページの上に重ねるだけで、ページは動かさない。
 * ★投稿したら閉じて、タイムラインの一番上を見せる★ タイムライン以外のページ・ギャラリー・検索中なら
 *   /guestbook へ移る（移ると一番上から出る）。投稿は usePosts の購読で一番上に届く。
 * ★知らせはトーストで出す★ 投稿画面は閉じるので、高画質版の送信・エピソード・新郎新婦あての知らせは
 *   ここで受け取って出す。エピソードの保存は閉じたあとも続き、終わったら届く。
 */
export function ComposerSheetProvider({
  enqueue,
  children,
}: {
  enqueue: (items: EnqueueItem[]) => void;
  children: ReactNode;
}) {
  const { user, tags, profile } = useGuestSessionContext();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const api = useMemo<ComposerSheetApi>(() => ({ open: () => setOpen(true) }), []);

  // /guestbook#composer で来たら開く（通知などの古いリンク）
  useEffect(() => {
    function check() {
      if (window.location.pathname !== GUESTBOOK_PATHS.home || window.location.hash !== `#${COMPOSER_ANCHOR_ID}`) return;
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      setOpen(true);
    }
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  const notify = useCallback((n: ComposerNotice) => {
    const id = ++nextId.current;
    setToasts((list) => [...list, { ...n, id }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), COMPOSER_TOAST_MS);
  }, []);

  const onPosted = useCallback(() => {
    setOpen(false);
    const onTimeline = window.location.pathname === GUESTBOOK_PATHS.home && window.location.search === "";
    if (onTimeline) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    else router.push(GUESTBOOK_PATHS.home);
  }, [router]);

  return (
    <ComposerSheetContext.Provider value={api}>
      {children}
      {open && user && (
        <AuthorNameProvider value={profile ? publicName(profile) : "ゲスト"}>
          <SheetFrame>
            <Composer
              user={user}
              tags={tags}
              onUploadOriginals={enqueue}
              onClose={() => setOpen(false)}
              onPosted={onPosted}
              onNotice={notify}
            />
          </SheetFrame>
        </AuthorNameProvider>
      )}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
    </ComposerSheetContext.Provider>
  );
}

/** 投稿画面を開く（「＋」・タイムラインの帯）。Provider の外（管理画面の見本など）では何もしない */
export function useComposerSheet(): ComposerSheetApi {
  return useContext(ComposerSheetContext) ?? { open: () => {} };
}

/**
 * 全画面の枠。下からせり上がる。
 * ★枠は見えている範囲（visualViewport）に合わせる★（useVisualViewportFrame の★参照）キーボードが出ても、
 *   上のバー（投稿する）は枠の上端に残り、入力欄はキーボードの上に収まる。
 * ★表示中は後ろのページをスクロールさせない★（閉じたら元の位置のまま）
 */
function SheetFrame({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  useVisualViewportFrame(frame);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={frame} role="dialog" aria-modal="true" aria-label="新しい投稿" className="fixed inset-x-0 top-0 z-[60] h-dvh">
      <div className="composer-sheet-in mx-auto h-full max-w-xl overflow-hidden bg-white shadow-xl">{children}</div>
    </div>,
    document.body,
  );
}

const TOAST_TONE: Record<ComposerNotice["kind"], string> = {
  upload: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  episode: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  couple: "bg-pink-50 text-pink-800 ring-pink-200",
  error: "bg-rose-50 text-rose-800 ring-rose-200",
};

/** 投稿したあとの知らせ。下のタブの上に重ねる。少しで消え、× でも消せる */
function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[55] mx-auto flex max-w-xl flex-col gap-2 px-4"
      style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={`welcome-fade-in pointer-events-auto flex items-start gap-2 rounded-xl py-2 pl-3 pr-1 text-xs leading-relaxed shadow-lg ring-1 ring-inset ${TOAST_TONE[t.kind]}`}
        >
          <p className="min-w-0 flex-1 py-1">{t.text}</p>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="閉じる"
            className="flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * タイムラインの一番上の細い帯「📷 写真や一言を投稿する」。押すと投稿画面を開く（「＋」と同じ）。
 * 以前はここに投稿欄（Composer）をそのまま置いていた。高さは 52px ほどにして、タイムラインの邪魔をしない。
 * ★白い箱にしない★（Issue #236）紙の地の上に、押す場所の色（テラコッタ・sub）の文字と線のカメラを置き、下に罫線。
 */
export function ComposerStrip() {
  const { open } = useComposerSheet();
  return (
    <button
      type="button"
      onClick={open}
      className="-mx-4 flex h-[52px] w-[calc(100%+2rem)] touch-manipulation items-center gap-3 border-b border-stone-200 px-4 text-left text-sm font-semibold text-sub-600 transition hover:bg-stone-100/60"
    >
      <CameraIcon className="h-5 w-5" />
      {/* 右端に「＋」を置かない（Issue #238。右上の大きな＋とダブって見えた）。帯全体が押せる */}
      <span className="min-w-0 flex-1 truncate">写真や一言を投稿する</span>
    </button>
  );
}
