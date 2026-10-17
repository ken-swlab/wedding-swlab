"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useDoubleTap, type TapPoint } from "@/hooks/useDoubleTap";
import { prefersReducedMotion } from "@/hooks/useSwipe";
import { WELCOME_AFTER_LIKE_MS, WELCOME_FLY_MS } from "@/config/welcome";
import type { WelcomeContent } from "@/types/welcome";
import { useHeartBursts } from "./HeartBurst";
import { WelcomeCard } from "./WelcomeCard";

/**
 * 段階:
 *   arrive … 画面が暗くなり「新郎新婦から、思い出の写真が届きました」→ 写真のカード →「タップでいいね」
 *   fly    … ハートのあと、カードが縮みながらタイムラインの一番上（WelcomePinned）へ移る（FLIP）
 *   guide1 … 「ここがタイムライン。みんなの写真がここに流れてきます」（固定した投稿を照らす）
 *   guide2 … 「＋ から、あなたも写真を投稿できます」（＋ボタンを照らす）
 *   guide3 … 「仲間が待っています」（下のコミュニティのタブを照らす。Issue #174）。開くかどうかは任意（強制しない）
 */
type Phase = "arrive" | "fly" | "guide1" | "guide2" | "guide3";

/** 照らす場所（画面の座標） */
type Spot = { top: number; left: number; width: number; height: number };

const SPOT_PAD = 8;

function spotOf(el: Element | null): Spot | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top - SPOT_PAD, left: r.left - SPOT_PAD, width: r.width + SPOT_PAD * 2, height: r.height + SPOT_PAD * 2 };
}

/**
 * 承認後の初回の演出（Issue #150）。document.body へ Portal で全画面に出す。
 *
 * 呼び出し側（/guestbook・/admin/invitation_test）がすること:
 *   - onPin() でタイムラインの一番上に WelcomePinned を hidden で置く（[data-welcome-pin]）。
 *     演出のカードはそこを目がけて縮む。onReveal() で hidden を外す。
 *   - ＋ボタンに data-welcome-plus を付けておく（2つ目の案内で照らす）。
 *   - コミュニティのタブに data-welcome-community を付けておく（3つ目の案内で照らす。無ければ画面の中ほどに出す）。
 *   - onOpenCommunity: 3つ目の案内の「コミュニティを見る」を押したとき（渡さなければボタンを出さない）。
 *   - onLike: 本物の投稿のときだけ、いいねを保存する（仮の画像なら渡さない）。
 *   - onDone: 終わった・スキップされた。welcomeSeenAt の記録は呼び出し側（演出を始めたときに API）。
 *
 * ★ダブルタップは useDoubleTap（click の時刻と位置）で見分ける★ 写真の箱は touch-action: manipulation で、
 *   iOS のダブルタップでの拡大と競合させない。
 * ★いいねの案内は「タップでいいね」のボタンだけ★（Issue #157 A-4）写真のダブルタップでも同じ流れになるが、
 *   案内はしない（「ダブルタップでいいね」の文字とボタンが同時に出て、どちらを押すか迷わせていた）。
 * ★スキップは「タップでいいね」の下に置く★ 押したら演出をやめてタイムラインへ（いいねはしない）。案内の間は、どこをタップしても進む。
 *   右上に置くと、暗くした下に透けるヘッダーの＋ボタンと重なって見えた（Issue #167）。画面の下に固定すると、
 *   背の低い iPhone でカードと重なるため、カードと同じ列に並べる。
 * ★動かすのは transform と opacity だけ★ prefers-reduced-motion では、引き込みの動きを省いてフェードで切り替える。
 */
export function WelcomeMoment({
  content,
  onLike,
  onPin,
  onReveal,
  onDone,
  onOpenCommunity,
}: {
  content: WelcomeContent;
  onLike?: () => Promise<boolean>;
  onPin: () => void;
  onReveal: () => void;
  onDone: (result: { skipped: boolean; liked: boolean }) => void;
  onOpenCommunity?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("arrive");
  const [cardOn, setCardOn] = useState(false);
  const [liked, setLiked] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [fading, setFading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const likedRef = useRef(false);
  const { tap } = useDoubleTap();
  const hearts = useHeartBursts();
  const handlers = useRef({ onLike, onPin, onReveal, onDone });
  useEffect(() => {
    handlers.current = { onLike, onPin, onReveal, onDone };
  }, [onLike, onPin, onReveal, onDone]);

  // 表示中はページをスクロールさせない（引っ張って更新も動かさない）
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 届く → 写真が現れる（「タップでいいね」も一緒に出す）
  useEffect(() => {
    const a = setTimeout(() => setCardOn(true), 900);
    return () => clearTimeout(a);
  }, []);

  const finish = useCallback((skipped: boolean) => {
    if (finished.current) return;
    finished.current = true;
    handlers.current.onReveal();
    handlers.current.onDone({ skipped, liked: likedRef.current });
  }, []);

  /** カードをタイムラインの一番上へ引き込む（FLIP: 今の位置と行き先を測り、差を transform で埋める） */
  const fly = useCallback(async () => {
    setPhase("fly");
    handlers.current.onPin();
    // 置き場所が描かれるのを待つ
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const pin = document.querySelector("[data-welcome-pin]");
    pin?.scrollIntoView({ block: "center" });
    await new Promise((r) => requestAnimationFrame(r));
    const card = cardRef.current;
    const backdrop = backdropRef.current;
    const reduce = prefersReducedMotion();
    if (card && pin && !reduce) {
      const from = card.getBoundingClientRect();
      const target = pin.querySelector("article")?.getBoundingClientRect() ?? pin.getBoundingClientRect();
      const dx = target.left - from.left;
      const dy = target.top - from.top;
      const s = target.width / (from.width || 1);
      const anim = card.animate(
        [{ transform: "translate(0px, 0px) scale(1)" }, { transform: `translate(${dx}px, ${dy}px) scale(${s})` }],
        { duration: WELCOME_FLY_MS, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" },
      );
      backdrop?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: WELCOME_FLY_MS, fill: "forwards" });
      await anim.finished.catch(() => {});
    } else {
      // 動きを減らす設定: 引き込まず、フェードで切り替える
      setFading(true);
      await new Promise((r) => setTimeout(r, 300));
    }
    if (finished.current) return;
    handlers.current.onReveal();
    setSpot(spotOf(pin));
    setPhase("guide1");
  }, []);

  /** いいね（ダブルタップ・「タップでいいね」のどちらからも） */
  const like = useCallback(
    (point: TapPoint) => {
      hearts.show(point);
      if (likedRef.current) return;
      likedRef.current = true;
      setLiked(true);
      // ★本物の投稿のときだけ保存する★ 失敗しても演出は続ける（ハートの層が短く知らせる）
      handlers.current.onLike?.().then((ok) => {
        if (!ok) hearts.fail();
      });
      setTimeout(() => {
        if (!finished.current) void fly();
      }, WELCOME_AFTER_LIKE_MS);
    },
    [fly, hearts],
  );

  function onPhotoClick(e: MouseEvent<HTMLDivElement>) {
    if (phase !== "arrive" || !cardOn) return;
    tap(e, like);
  }

  function onTapButton() {
    const r = cardRef.current?.querySelector("[data-welcome-photo]")?.getBoundingClientRect();
    like(r ? { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 } : { clientX: innerWidth / 2, clientY: innerHeight / 2 });
  }

  /** 案内はどこをタップしても次へ */
  function onGuideTap() {
    if (phase === "guide1") {
      const plus = document.querySelector("[data-welcome-plus]");
      setSpot(spotOf(plus));
      setPhase("guide2");
    } else if (phase === "guide2") {
      setSpot(spotOf(document.querySelector("[data-welcome-community]")));
      setPhase("guide3");
    } else if (phase === "guide3") {
      finish(false);
    }
  }

  if (typeof document === "undefined") return null;
  const guiding = phase === "guide1" || phase === "guide2" || phase === "guide3";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="新郎新婦からの写真"
      className="fixed inset-0 z-[90] touch-manipulation select-none"
      onClick={guiding ? onGuideTap : undefined}
    >
      {!guiding && (
        <>
          <div ref={backdropRef} className="welcome-fade-in absolute inset-0 bg-black/60" />
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center px-5 transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <p
              role="status"
              className={`welcome-fade-in mb-5 text-center text-[15px] font-medium leading-relaxed text-white transition-opacity duration-300 ${phase === "fly" ? "opacity-0" : ""}`}
            >
              新郎新婦から、思い出の写真が届きました
            </p>
            <div
              ref={cardRef}
              className={`w-full max-w-md origin-top-left transition-[opacity,transform] duration-500 motion-reduce:transition-opacity ${
                cardOn ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"
              }`}
            >
              <WelcomeCard content={content} liked={liked} photoOverlay={hearts.layer} onPhotoClick={onPhotoClick} />
            </div>
            <div className={`mt-5 flex min-h-12 flex-col items-center gap-2 transition-opacity duration-300 ${cardOn && phase === "arrive" ? "opacity-100" : "opacity-0"}`}>
              {!liked && (
                <button
                  type="button"
                  onClick={onTapButton}
                  className="min-h-11 touch-manipulation rounded-full bg-white px-5 text-sm font-medium text-stone-900 shadow"
                >
                  タップでいいね
                </button>
              )}
            </div>
            {/* 案内の間は出さない（どこをタップしても進む）。fly の間も押せる */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                finish(true);
              }}
              className="mt-1 min-h-11 touch-manipulation rounded-full px-5 text-xs text-white/80 underline underline-offset-4"
            >
              スキップ
            </button>
          </div>
        </>
      )}

      {guiding && (
        <>
          {/* 照らす場所の外を暗くする（大きな影で周りを塗る） */}
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-2xl transition-all duration-300 motion-reduce:transition-none"
            style={
              spot
                ? { ...spot, boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)" }
                : { inset: 0, background: "rgba(0,0,0,0.6)" }
            }
          />
          <GuideBubble
            spot={spot}
            text={
              phase === "guide1"
                ? "ここがタイムライン。みんなの写真がここに流れてきます"
                : phase === "guide2"
                  ? "＋ から、あなたも写真を投稿できます"
                  : "仲間が待っています。コミュニティで、同じグループの参加予定のメンバーを見られます"
            }
            action={
              phase === "guide3" && onOpenCommunity
                ? {
                    label: "コミュニティを見る",
                    onClick: () => {
                      finish(false);
                      onOpenCommunity();
                    },
                  }
                : undefined
            }
          />
        </>
      )}

    </div>,
    document.body,
  );
}

/** 吹き出しに要る高さの目安 (px) */
const BUBBLE_ROOM = 130;

/**
 * 案内の吹き出し。照らす場所の下に置き、入りきらなければ上に置く。
 * ★上下どちらにも入らない（照らす投稿が画面の大半を占める）ときは、画面の下端に重ねる★
 */
function GuideBubble({ spot, text, action }: { spot: Spot | null; text: string; action?: { label: string; onClick: () => void } }) {
  const h = window.innerHeight;
  let style: CSSProperties = { top: "40%" };
  if (spot) {
    if (spot.top + spot.height + BUBBLE_ROOM < h) style = { top: Math.max(spot.top + spot.height + 12, 0) };
    else if (spot.top > BUBBLE_ROOM) style = { bottom: h - spot.top + 12 };
    else style = { bottom: "calc(1.5rem + env(safe-area-inset-bottom))" };
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center px-6" style={style}>
      <p className="welcome-fade-in max-w-xs rounded-2xl bg-white px-4 py-3 text-center text-sm font-medium leading-relaxed text-stone-800 shadow-lg">
        {text}
      </p>
      {action && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
          className="pointer-events-auto mt-3 min-h-11 touch-manipulation rounded-full bg-white px-5 text-sm font-medium text-stone-900 shadow"
        >
          {action.label}
        </button>
      )}
      <p className="mt-2 text-xs text-white/80">{action ? "ほかの場所をタップで閉じる" : "タップで次へ"}</p>
    </div>
  );
}
