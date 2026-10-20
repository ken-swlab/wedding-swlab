"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { useSeenOnce } from "@/hooks/useSeenOnce";
import { INVITATION_COLORS } from "@/config/invitation";
import { rehost } from "@/lib/media-url";
import type {
  InvitationFromUs,
  InvitationHeroPhoto as HeroPhoto,
  InvitationHighlight,
  InvitationHighlightKey,
} from "@/types/invitation";

const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

/**
 * 招待状に足した「行きたい」と思わせる部分（Issue #173）。中身は config/invitation（GET /api/guest/invitation）から。
 *   シルエット写真 … 1画面目の直後。横幅いっぱい・4:5。上下はページの地へ溶け込ませる。日付と一言を重ねられる（未設定なら出さない）
 *   ふたりから     … 2列のカード。上に 4:5 の写真（顔とお酒まで）、下に名前・メッセージ（写真が未設定なら頭文字）
 *   当日のおたのしみ … 文字中心のカードと小さな線画のアイコン
 *
 * ★写真の枠の大きさは先に確保する★ 縦横比を CSS で決めてから画像を読む（読み込みで画面がガタつかないように）。
 * ★名前・日付・文言は props でだけ受け取る★ 定数として書かない（公開リポジトリ。CLAUDE.md ルール 4a）。
 * ★本物の写真の URL は rehost() を通す★ 公開バケットのドメインを変えたときに、保存済みの URL を付け替える（media-url.ts）。
 */

/** 本物の写真（https）は rehost で配信元を合わせる。仮の画像（/placeholders/…）はそのまま */
function photoSrc(url: string): string {
  return url.startsWith("https://") ? rehost(url) : url;
}

/** 画面に入ったら true になる（一度だけ） */
function useRevealOnce<T extends Element>() {
  const [shown, setShown] = useState(false);
  const ref = useSeenOnce<T>(() => setShown(true));
  return { ref, shown };
}

/**
 * 写真の上下を、ページの地の色へ溶け込ませるマスク（Issue #178）。上下それぞれ高さの 14%。左右は端まで写真のまま。
 * ★四角い境目を見せない★ スタジオの白背景と紙の地の色の差が、四角く浮いて見えたため。
 *   マスクは枠（読み込み前の灰色の地を含む）ごと効くので、色を合わせる必要がない。
 */
const HERO_FADE_MASK = "linear-gradient(180deg, transparent 0, #000 14%, #000 86%, transparent 100%)";

/** 重ねる文字の色。黒は白背景のスタジオ写真向けで、影を付けない */
const OVERLAY_STYLE: Record<HeroPhoto["overlayColor"], CSSProperties> = {
  white: { color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.45), 0 0 18px rgba(0,0,0,0.3)" },
  black: { color: INVITATION_COLORS.ink },
};

/**
 * シルエット写真。画面に入ったら 1.2 秒でふわっと現れる（わずかに縮小→等倍。globals.css の invitation-reveal）。
 * prefers-reduced-motion では動かさず、はじめから出しておく。
 * ★重ねる文字は、日付も一言も未設定なら何も出さない★
 */
export function InvitationHeroPhoto({ photo }: { photo: HeroPhoto }) {
  const { ref, shown } = useRevealOnce<HTMLDivElement>();
  return (
    <div className="mb-7">
      <div
        ref={ref}
        data-shown={shown ? "" : undefined}
        className="invitation-reveal relative aspect-[4/5] w-full overflow-hidden bg-stone-200"
        style={{ maskImage: HERO_FADE_MASK, WebkitMaskImage: HERO_FADE_MASK }}
      >
        <Image src={photoSrc(photo.url)} alt={photo.alt} fill sizes="100vw" className="object-cover" />
        {(photo.overlayDate || photo.overlayText) && (
          <p className="absolute inset-x-0 top-[13%] text-center" style={OVERLAY_STYLE[photo.overlayColor]}>
            {photo.overlayDate && (
              <span className="block text-[40px] font-bold tracking-[0.12em] tabular-nums" style={{ fontFamily: MONO }}>
                {photo.overlayDate}
              </span>
            )}
            {photo.overlayText && <span className="mt-1 block font-serif text-[15px] tracking-[0.35em]">{photo.overlayText}</span>}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * ふたりからのカード（2列に並べる）。写真はカードの上に横幅いっぱい・4:5、その下に名前とメッセージ。
 * ★写真は 4:5★ 顔と手に持ったお酒まで入る大きさにするため（以前は 64px の丸で、顔しか見えなかった）。
 *   ops.mjs の PHOTO_FROM_US_WIDTH / PHOTO_FROM_US_HEIGHT（photo set groom|bride で縮める大きさ）と縦横比をそろえる。
 */
export function InvitationFromUsCards({ cards }: { cards: readonly InvitationFromUs[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {cards.map((c, i) => (
        <li key={i} className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white">
          <span className="relative block aspect-[4/5] w-full bg-stone-200">
            {c.photoUrl ? (
              <Image src={photoSrc(c.photoUrl)} alt={c.alt} fill sizes="(max-width: 448px) 50vw, 210px" className="object-cover" />
            ) : (
              // ★写真が未設定なら、名前の頭文字★
              <span aria-hidden className="flex h-full w-full items-center justify-center font-serif text-4xl text-stone-500">
                {Array.from(c.name)[0]}
              </span>
            )}
          </span>
          <div className="px-3 pb-4 pt-3">
            <p className="font-serif text-[15px] tracking-[0.08em] text-stone-800">{c.name}</p>
            <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-[1.85] text-stone-600">{c.message}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 当日のおたのしみのカード（文字中心） */
export function InvitationHighlights({ items }: { items: readonly InvitationHighlight[] }) {
  return (
    <ul className="space-y-3">
      {items.map((h, i) => (
        <li key={i} className="flex gap-3.5 rounded-2xl border border-stone-200/80 bg-white p-4">
          <span aria-hidden className="mt-0.5 shrink-0 text-stone-500">
            <HighlightIcon kind={h.key} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium tracking-[0.1em] text-stone-800">{h.title}</p>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-[1.9] text-stone-600">{h.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 小さな線画のアイコン（料理・お酒・競技） */
function HighlightIcon({ kind }: { kind: InvitationHighlightKey }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (kind) {
    case "food":
      // フォークとナイフ
      return (
        <svg {...common}>
          <path d="M7 3v7a2 2 0 0 0 2 2v9M5 3v5M9 3v5M7 12a2 2 0 0 1-2-2" />
          <path d="M17 21V3c-2 1.5-3 4-3 7v3h3" />
        </svg>
      );
    case "drink":
      // グラス
      return (
        <svg {...common}>
          <path d="M6 3h12l-1.5 7a4.5 4.5 0 0 1-9 0L6 3Z" />
          <path d="M12 14.5V21M8.5 21h7M6.6 6h10.8" />
        </svg>
      );
    case "game":
      // ストップウォッチ
      return (
        <svg {...common}>
          <circle cx="12" cy="13.5" r="7.5" />
          <path d="M12 13.5V9.5M10 2.5h4M12 2.5V6M18.5 6.5l1.5-1.5" />
        </svg>
      );
  }
}
