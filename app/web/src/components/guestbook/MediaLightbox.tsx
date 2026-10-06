"use client";

import Image from "next/image";
import { useAuthorProfile } from "@/lib/profiles-client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { MediaItem, Post } from "@/types";
import { displayStatus } from "@/lib/original-status";
import { bestSrc, thumbSrc } from "@/lib/media-url";
import {
  isSwipeExempt,
  prefersReducedMotion,
  useSwipe,
  type SwipeState,
} from "@/hooks/useSwipe";
import {
  MOTION_EASING,
  SWIPE_DISMISS_RATIO,
  SWIPE_FLICK_VELOCITY,
  VIEWER_CLOSE_MS,
  VIEWER_OPEN_MS,
  VIEWER_PAGE_MS,
} from "@/config/guestbook";
import { RichText } from "./RichText";

/**
 * 原本の状態を伝える注記。
 * ★Partial を外してある★ 状態を足したときにコンパイルエラーにするため。
 */
const ORIGINAL_NOTE: Record<NonNullable<MediaItem["originalStatus"]>, string | null> = {
  pending: "高画質版はまだ送信されていません",
  uploaded: "高画質版を準備中です（数分かかります）",
  published: null,
  skipped: "この写真の高画質版は保存できませんでした",
  failed: "高画質版の送信に失敗しています",
  unavailable: "高画質版は取得できませんでした",
};

export type MediaSize = { w: number; h: number };

/** 一覧のマスに表示済みの写真・動画から、元の縦横の大きさを読む */
export function measureMedia(cell: HTMLElement, m: MediaItem): MediaSize | null {
  const img = cell.querySelector("img");
  if (img?.naturalWidth) return { w: img.naturalWidth, h: img.naturalHeight };
  const video = cell.querySelector("video");
  if (video?.videoWidth) return { w: video.videoWidth, h: video.videoHeight };
  return m.width && m.height ? { w: m.width, h: m.height } : null;
}

type Box = { left: number; top: number; width: number; height: number };

/** 画面（w×h）に収まる最大の大きさで、中央に置いたときの位置。比率が分からなければ画面いっぱい */
function fitBox(size: MediaSize | null, w: number, h: number): Box {
  if (!size) return { left: 0, top: 0, width: w, height: h };
  const s = Math.min(w / size.w, h / size.h);
  const width = size.w * s;
  const height = size.h * s;
  return { left: (w - width) / 2, top: (h - height) / 2, width, height };
}

/** 枠（box）が一覧のマス（rect）をちょうど覆うときの transform。マスは object-cover なので覆う側に合わせる */
function coverTransform(box: Box, rect: DOMRect): string {
  const k = Math.max(rect.width / box.width, rect.height / box.height);
  const tx = rect.left + rect.width / 2 - (box.left + box.width / 2);
  const ty = rect.top + rect.height / 2 - (box.top + box.height / 2);
  return `translate3d(${tx}px, ${ty}px, 0) scale(${k})`;
}

function clipTo(rect: DOMRect, w: number, h: number): string {
  const top = Math.max(0, rect.top);
  const left = Math.max(0, rect.left);
  const right = Math.max(0, w - rect.right);
  const bottom = Math.max(0, h - rect.bottom);
  return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
}
const CLIP_FULL = "inset(0px 0px 0px 0px)";

function onScreen(rect: DOMRect | null, w: number, h: number): rect is DOMRect {
  return !!rect && rect.width > 0 && rect.bottom > 0 && rect.top < h && rect.right > 0 && rect.left < w;
}

function fullDate(post: Post) {
  if (!post.createdAt) return "";
  return post.createdAt.toDate().toLocaleString("ja-JP", {
    month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** スワイプ中の操作の種類。縦横が決まった時点で決める */
type DragMode = "dismiss" | "page";

/**
 * 写真ビューア。タップした写真がその場から全画面へ広がる。
 *
 * ★まず一覧のサムネイル（表示済みでキャッシュにある）を出し、高画質版は読めたら重ねる★
 *   原本（bestSrc）を待ってから開くと数秒かかる。拡大の始まりの大きさも
 *   サムネイルの縦横から決めるので、開いた瞬間から形が合っている。
 * ★タップでは閉じない★
 *   披露宴では片手・ほろ酔いでの操作になる。拡大してじっくり見ようとしただけで
 *   消えないよう、タップは下の文字情報の表示・非表示の切り替えだけにする。
 *   閉じるのは、はっきり下（1枚目なら右）へスワイプしたときと Esc だけ。
 *   ×ボタンは画面に出さない（Issue #31）。読み上げ利用者向けに見えない「閉じる」だけ残す。
 * ★重なり順を明示する★ 写真は z-0、文字情報は z-20、見えない閉じるボタンは z-30。
 *   position の付いた写真の箱は、z-index が無いと DOM 順で後ろの操作系を覆ってしまう。
 * ★body 直下に portal で出す★ 詳細シートの展開中は親に transform が付き、
 *   その中の fixed は画面ではなくシートに固定されてしまう。
 */
export function MediaLightbox({
  post,
  media,
  startIndex,
  startSize,
  thumbRect,
  onClose,
}: {
  post: Post;
  media: MediaItem[];
  startIndex: number;
  startSize: MediaSize | null;
  /** 一覧のマスの位置。開くときはここから広がり、閉じるときはここへ戻る */
  thumbRect: (index: number) => DOMRect | null;
  onClose: () => void;
}) {
  const author = useAuthorProfile(post.authorUid, { name: post.authorName, photoURL: post.authorPhotoURL });
  const [index, setIndex] = useState(startIndex);
  const [sizes, setSizes] = useState<(MediaSize | null)[]>(() =>
    media.map((m, i) =>
      i === startIndex && startSize ? startSize : m.width && m.height ? { w: m.width, h: m.height } : null,
    ),
  );
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [showInfo, setShowInfo] = useState(true);

  const root = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const info = useRef<HTMLDivElement>(null);
  const frames = useRef<(HTMLDivElement | null)[]>([]);
  const mode = useRef<DragMode>("dismiss");
  /** 動画の上から始まった操作か。横はシークバーの操作なのでブラウザに任せる */
  const onVideo = useRef(false);
  /** 閉じる・送る動きの途中。重ねて操作させない */
  const busy = useRef(false);

  // 裏の画面を止める。PullToRefresh もこれを見て引っ張りを始めない
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 写真の帯を index 枚目の位置へ置く（操作中でなければ） */
  const placeTrack = useCallback(
    (i: number, dx = 0) => {
      if (track.current) track.current.style.transform = `translate3d(${-i * view.w + dx}px, 0, 0)`;
    },
    [view.w],
  );
  useLayoutEffect(() => placeTrack(index), [index, placeTrack]);

  // --- 開く: 一覧のマスから広がる ---
  useLayoutEffect(() => {
    const frame = frames.current[startIndex];
    const { w, h } = view;
    const size = sizes[startIndex];
    if (!frame || !stage.current || !backdrop.current || prefersReducedMotion()) return;
    const timing = { duration: VIEWER_OPEN_MS, easing: MOTION_EASING };
    const rect = thumbRect(startIndex);
    backdrop.current.animate([{ opacity: 0 }, { opacity: 1 }], timing);
    info.current?.animate([{ opacity: 0 }, { opacity: 1 }], timing);
    if (onScreen(rect, w, h) && size) {
      const box = fitBox(size, w, h);
      frame.animate([{ transform: coverTransform(box, rect) }, { transform: "none" }], timing);
      stage.current.animate([{ clipPath: clipTo(rect, w, h) }, { clipPath: CLIP_FULL }], timing);
    } else {
      frame.animate(
        [{ transform: "scale(0.92)", opacity: 0 }, { transform: "none", opacity: 1 }],
        timing,
      );
    }
    // 開いたときに1回だけ。index などが変わっても広がり直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 閉じる: 今の写真のマスへ戻る（見えなければ、払った向きへ流して消す） ---
  const close = useCallback(
    (from = "none", away: { x: number; y: number } = { x: 0, y: 1 }, fromOpacity = 1) => {
      if (busy.current) return;
      busy.current = true;
      const frame = frames.current[index];
      const w = view.w;
      const h = view.h;
      if (!frame || !stage.current || !backdrop.current || prefersReducedMotion()) {
        onClose();
        return;
      }
      const timing = { duration: VIEWER_CLOSE_MS, easing: MOTION_EASING, fill: "forwards" as const };
      const rect = thumbRect(index);
      backdrop.current.animate([{ opacity: fromOpacity }, { opacity: 0 }], timing).onfinish = onClose;
      info.current?.animate([{ opacity: 0 }, { opacity: 0 }], timing);
      if (onScreen(rect, w, h)) {
        const box = fitBox(sizes[index], w, h);
        frame.animate([{ transform: from }, { transform: coverTransform(box, rect) }], timing);
        stage.current.animate([{ clipPath: CLIP_FULL }, { clipPath: clipTo(rect, w, h) }], timing);
      } else {
        frame.animate(
          [
            { transform: from, opacity: 1 },
            { transform: `translate3d(${away.x * w}px, ${away.y * h}px, 0)`, opacity: 0 },
          ],
          timing,
        );
      }
    },
    [index, onClose, sizes, thumbRect, view.w, view.h],
  );

  /** 前後の写真へ送る（端なら元の位置へ戻す） */
  const page = useCallback(
    (next: number, dx = 0) => {
      const el = track.current;
      if (!el) return;
      const target = Math.max(0, Math.min(media.length - 1, next));
      const from = `translate3d(${-index * view.w + dx}px, 0, 0)`;
      const to = `translate3d(${-target * view.w}px, 0, 0)`;
      placeTrack(target);
      if (from !== to && !prefersReducedMotion()) {
        el.animate([{ transform: from }, { transform: to }], {
          duration: VIEWER_PAGE_MS,
          easing: MOTION_EASING,
        });
      }
      setIndex(target);
    },
    [index, media.length, placeTrack, view.w],
  );

  useEffect(() => {
    // ★捕捉段階で受けて preventDefault する★ 詳細シートの上で開いているとき、
    //   Esc でシートまで一緒に閉じないように（シートは defaultPrevented を見て無視する）
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") page(index + 1);
      else if (e.key === "ArrowLeft") page(index - 1);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close, page, index]);

  /** 閉じる方向へ引いているときの写真の動き（引くほど小さく、背景は透ける） */
  function dismissTransform(s: SwipeState): { transform: string; progress: number } {
    const dist = s.axis === "y" ? Math.max(0, s.dy) : Math.max(0, s.dx);
    const progress = Math.min(1, dist / ((s.axis === "y" ? view.h : view.w) * 0.6));
    const scale = 1 - progress * 0.25;
    return {
      transform: `translate3d(${s.dx}px, ${Math.max(0, s.dy)}px, 0) scale(${scale})`,
      progress,
    };
  }

  const wasSwiping = useSwipe(root, {
    canStart: (t) => {
      if (busy.current || isSwipeExempt(t)) return false;
      onVideo.current = !!t.closest("video");
      // 長い本文は文字情報の中でスクロールさせる
      const scroller = t.closest<HTMLElement>("[data-scroll]");
      return !scroller || scroller.scrollHeight <= scroller.clientHeight;
    },
    accept: (axis, d) => {
      if (axis === "y") {
        mode.current = "dismiss";
        return d > 0;
      }
      if (onVideo.current) return false;
      // 1枚目で右へ払ったら閉じる。それ以外の横の操作は写真を送る
      mode.current = d > 0 && index === 0 ? "dismiss" : "page";
      return true;
    },
    // 引き受けない上向きの操作も止める（裏のページや LINE のシートを動かさない）。
    // 動画の横の操作（シーク）だけは止めない
    blockNative: (axis) => !(onVideo.current && axis === "x"),
    onMove: (s) => {
      if (mode.current === "page") {
        const atEdge = (s.dx > 0 && index === 0) || (s.dx < 0 && index === media.length - 1);
        placeTrack(index, atEdge ? s.dx * 0.3 : s.dx);
        return;
      }
      const frame = frames.current[index];
      const { transform, progress } = dismissTransform(s);
      if (frame) frame.style.transform = transform;
      if (backdrop.current) backdrop.current.style.opacity = String(1 - progress * 0.85);
      if (info.current) info.current.style.opacity = "0";
    },
    onEnd: (s) => {
      if (mode.current === "page") {
        const flick = Math.sign(s.velocity) === Math.sign(s.dx) && Math.abs(s.velocity) > SWIPE_FLICK_VELOCITY;
        const go = Math.abs(s.dx) > view.w * SWIPE_DISMISS_RATIO || flick;
        page(go ? index + (s.dx < 0 ? 1 : -1) : index, s.dx);
        return;
      }
      const frame = frames.current[index];
      const { transform, progress } = dismissTransform(s);
      const dist = s.axis === "y" ? s.dy : s.dx;
      const size = s.axis === "y" ? view.h : view.w;
      const go = dist > size * SWIPE_DISMISS_RATIO || (dist > 0 && s.velocity > SWIPE_FLICK_VELOCITY);
      if (frame) frame.style.transform = "";
      if (backdrop.current) backdrop.current.style.opacity = "";
      if (info.current) info.current.style.opacity = "";
      if (go) {
        close(transform, s.axis === "y" ? { x: 0, y: 1 } : { x: 1, y: 0 }, 1 - progress * 0.85);
        return;
      }
      // 戻す
      const timing = { duration: VIEWER_PAGE_MS, easing: MOTION_EASING };
      frame?.animate([{ transform }, { transform: "none" }], timing);
      backdrop.current?.animate([{ opacity: 1 - progress * 0.85 }, { opacity: 1 }], timing);
    },
  });

  function onTap(e: MouseEvent) {
    if (wasSwiping() || busy.current) return;
    // 動画の操作ボタンや、文字情報の中のボタンのタップはそれ自身の操作
    if ((e.target as Element).closest("video, button, a")) return;
    setShowInfo((v) => !v);
  }

  function rememberSize(i: number, el: HTMLImageElement | HTMLVideoElement) {
    const w = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
    const h = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
    if (!w || !h || sizes[i]) return;
    setSizes((prev) => prev.map((s, j) => (j === i ? { w, h } : s)));
  }

  const item = media[index];
  const ds = item ? displayStatus(item) : null;
  const note = ds ? ORIGINAL_NOTE[ds] : null;

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="写真の拡大表示"
      onClick={onTap}
      className="allow-callout fixed inset-0 z-[60] select-none overflow-hidden"
      style={{ touchAction: "pinch-zoom" }}
    >
      <div ref={backdrop} className="absolute inset-0 bg-black" />

      {/* --- 写真・動画（最背面。タップしても閉じない） --- */}
      <div ref={stage} className="absolute inset-0 z-0 overflow-hidden">
        <div ref={track} className="flex h-full will-change-transform">
          {media.map((m, i) => {
            const box = fitBox(sizes[i], view.w, view.h);
            const near = Math.abs(i - index) <= 1;
            const best = bestSrc(m);
            const thumb = thumbSrc(m);
            return (
              <div
                key={m.storagePath || `${m.url}-${i}`}
                className="relative h-full shrink-0"
                style={{ width: view.w }}
              >
                <div
                  ref={(el) => {
                    frames.current[i] = el;
                  }}
                  className="absolute"
                  style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                >
                  {m.type === "video" ? (
                    <video
                      // 表示中のものだけ再生する。送ったら作り直して止める
                      key={i === index ? "playing" : "idle"}
                      src={best}
                      controls={i === index}
                      autoPlay={i === index}
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={(e) => rememberSize(i, e.currentTarget)}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <>
                      {/* 一覧で表示済みのサムネイル。高画質版が読めるまでの仮の表示 */}
                      <Image
                        src={thumb}
                        alt={best === thumb ? (m.alt ?? "") : ""}
                        fill
                        sizes="100vw"
                        className="object-contain"
                        onLoad={(e) => rememberSize(i, e.currentTarget)}
                        priority={i === startIndex}
                      />
                      {best !== thumb && near && <BestImage src={best} alt={m.alt ?? ""} />}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- 文字情報（タップのたびに表示・非表示） --- */}
      <div
        ref={info}
        aria-hidden={!showInfo}
        className={`absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/85 via-black/55 to-transparent px-4 pt-16 text-white transition-opacity duration-200 ${
          showInfo ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto max-w-xl">
          <div className="flex items-center gap-2.5">
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white/20">
              {author.photoURL && (
                <Image src={author.photoURL} alt="" fill sizes="32px" className="object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{author.name}</p>
              <p className="text-[11px] text-white/55">{fullDate(post)}</p>
            </div>
            {media.length > 1 && (
              <p className="shrink-0 text-xs tabular-nums text-white/70">
                {index + 1} / {media.length}
              </p>
            )}
          </div>
          {post.text && (
            <div data-scroll className="mt-2 max-h-[30dvh] overflow-y-auto overscroll-contain">
              <RichText
                text={post.text}
                className="block whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90"
              />
            </div>
          )}
          {note && <p className="mt-2 text-[11px] text-white/60">{note}</p>}
        </div>
      </div>

      {/* 見えない「閉じる」。画面読み上げとキーボードの操作用（見た目のボタンは置かない） */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        className="sr-only z-30 focus:not-sr-only focus:absolute focus:right-3 focus:top-3 focus:rounded-full focus:bg-black/60 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        閉じる
      </button>
    </div>,
    document.body,
  );
}

/** 高画質版。読めるまで透明にしておき、下のサムネイルから切り替える */
function BestImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="100vw"
      onLoad={() => setLoaded(true)}
      className={`object-contain transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}
