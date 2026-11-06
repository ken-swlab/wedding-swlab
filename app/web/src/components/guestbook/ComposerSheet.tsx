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
import { usePostOutbox, type PostOutbox } from "@/hooks/usePostOutbox";
import { usePhotoIntro } from "./PhotoIntroSheet";
import { useBackToClose } from "@/hooks/useHistoryOverlay";

type ComposerSheetApi = { open: () => void };

const ComposerSheetContext = createContext<ComposerSheetApi | null>(null);
/** 送信中の投稿の列（Issue #254。usePostOutbox）。タイムラインが一番上に出す */
const PostOutboxContext = createContext<PostOutbox | null>(null);

type Toast = ComposerNotice & { id: number };

/**
 * 投稿画面（全画面のシート）を開く入口と、投稿したあとの知らせ（トースト）。Issue #224。
 * GuestbookDataProvider の中に1つだけ置く（/guestbook 以下のどのページの「＋」からでも開ける）。
 *
 * ★開くのは「＋」（GuestbookShell）・タイムラインの帯（ComposerStrip）・/guestbook#composer の URL★
 *   URL で来たときは開いたあと #composer を URL から消す（戻る・再読み込みで何度も開かないように）。
 * ★閉じても元のスクロール位置のまま★ シートはページの上に重ねるだけで、ページは動かさない。
 * ★投稿したら閉じて、タイムラインの一番上を見せる★ タイムライン以外のページ・ギャラリー・検索中なら
 *   /guestbook へ移る（移ると一番上から出る）。
 * ★送信は待たない★（Issue #254）「投稿する」で送信の列（usePostOutbox）に渡してすぐ閉じ、タイムラインの一番上に
 *   送信中の投稿（端末の中の写真と本文）を出す。書けたら、購読で届いた本物に入れ替える。
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
  /**
   * ★戻る（左端のスワイプ）で閉じたときは、書きかけを残す★（Issue #273。確認は出さない）
   *   投稿画面を消さずに隠しておき（parked）、次に開いたら続きから書ける。キャンセル・投稿したときは消す。
   */
  const [parked, setParked] = useState(false);
  const closeByBack = useCallback(() => {
    setOpen(false);
    setParked(true);
  }, []);
  useBackToClose(open, closeByBack);
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
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), n.ms ?? COMPOSER_TOAST_MS);
  }, []);

  // ★送信は投稿画面を閉じても続く★（Issue #254）列はここ（ゲストブックの間ずっとある所）に1つだけ持つ
  //   写真付きで初めて投稿したら「写真は2回に分けて届けます」を出す（Issue #272）
  const { showIfFirst } = usePhotoIntro();
  const outbox = usePostOutbox({ enqueue, notify, onPhotosPosted: showIfFirst });

  const onPosted = useCallback(() => {
    const onTimeline = window.location.pathname === GUESTBOOK_PATHS.home && window.location.search === "";
    // ★閉じたあと（積んだ履歴を戻したあと）に動く★（Issue #273）戻すと、ブラウザがスクロール位置を開いたときの位置に戻し、
    //   router.push と重なると移った先を取り消してしまう。戻し終わり（popstate）か、少し待ってから動く
    afterHistoryBack(() => {
      if (onTimeline) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      else router.push(GUESTBOOK_PATHS.home);
    });
    setOpen(false);
    setParked(false);
  }, [router]);
  const onCancel = useCallback(() => {
    setOpen(false);
    setParked(false);
  }, []);

  return (
    <ComposerSheetContext.Provider value={api}>
      <PostOutboxContext.Provider value={outbox}>{children}</PostOutboxContext.Provider>
      {(open || parked) && user && (
        <AuthorNameProvider value={profile ? publicName(profile) : "ゲスト"}>
          <SheetFrame visible={open}>
            <Composer
              user={user}
              tags={tags}
              onSubmitDraft={outbox.submit}
              onClose={onCancel}
              onPosted={onPosted}
            />
          </SheetFrame>
        </AuthorNameProvider>
      )}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
    </ComposerSheetContext.Provider>
  );
}

/**
 * 積んだ履歴を戻したあとに fn を動かす（Issue #273）。戻し終わり（popstate）か、戻さなかったとき用に少し待ってから。
 */
function afterHistoryBack(fn: () => void) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", onPop);
    clearTimeout(timer);
    // ブラウザがスクロール位置を戻し終えてから
    requestAnimationFrame(fn);
  };
  const onPop = () => run();
  window.addEventListener("popstate", onPop);
  const timer = setTimeout(run, 400);
}

/** 送信中の投稿の列（Issue #254）。Provider の外では null */
export function usePostOutboxContext(): PostOutbox | null {
  return useContext(PostOutboxContext);
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
function SheetFrame({ visible, children }: { visible: boolean; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  useVisualViewportFrame(frame);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (typeof document === "undefined") return null;
  // ★隠している間（戻るで閉じた書きかけ）は hidden★ 見えない入力欄にフォーカスやタップが届かない
  return createPortal(
    <div ref={frame} role="dialog" aria-modal="true" aria-label="新しい投稿" hidden={!visible} className="fixed inset-x-0 top-0 z-[60] h-dvh">
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
          <p className="min-w-0 flex-1 py-1">
            {t.text}
            {t.sub && <span className="block text-[length:calc(11px*var(--inv-scale))] opacity-80">{t.sub}</span>}
          </p>
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
