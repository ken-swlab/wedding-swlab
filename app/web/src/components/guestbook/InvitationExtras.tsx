"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { useSeenOnce } from "@/hooks/useSeenOnce";
import { INVITATION_COLORS, INVITATION_HERO } from "@/config/invitation";
import { rehost } from "@/lib/media-url";
import type {
  InvitationFromUs,
  InvitationHeroPhoto as HeroPhoto,
  InvitationHighlight,
  InvitationHighlightKey,
} from "@/types/invitation";

/**
 * 招待状に足した「行きたい」と思わせる部分（Issue #173）。中身は config/invitation（GET /api/guest/invitation）から。
 *   シルエット写真 … 1画面目のあと、大きな余白を下ろした先に、幅 58%・正方形で出す（Issue #193。2色刷りで地は紙の色）。
 *                    日付と一言を重ねられる（未設定なら出さない）
 *   ふたりから     … 1人1段。4:5 の写真（顔とお酒まで）と、名前＋メッセージを横に並べ、写真の左右を交互にする
 *                    （写真が未設定なら頭文字）
 *   当日のおたのしみ … 小さな線画のアイコンと文字。項目の間を罫線で区切る
 * ★白いカードを使わない★（Issue #189）白いカードが続くとアプリの画面に見えるため。書体は CLAUDE.md の書体ルール。
 *
 * ★写真の枠の大きさは先に確保する★ 縦横比を CSS で決めてから画像を読む（読み込みで画面がガタつかないように）。
 * ★名前・日付・文言は props でだけ受け取る★ 定数として書かない（公開リポジトリ。CLAUDE.md ルール 4a）。
 * ★本物の写真の URL は rehost() を通す★ 公開バケットのドメインを変えたときに、保存済みの URL を付け替える（media-url.ts）。
 */

/** 本物の写真（https）は rehost で配信元を合わせる。仮の画像（/placeholders/…）はそのまま */
function photoSrc(url: string): string {
  return url.startsWith("https://") ? rehost(url) : url;
}

/** 画面に入ったら true になる（一度だけ）。rootMargin で、入ったとみなす範囲を狭められる */
function useRevealOnce<T extends Element>(threshold?: number, rootMargin?: string) {
  const [shown, setShown] = useState(false);
  const ref = useSeenOnce<T>(() => setShown(true), threshold, rootMargin);
  return { ref, shown };
}

/** 重ねる文字の色。黒は白背景のスタジオ写真向けで、影を付けない */
const OVERLAY_STYLE: Record<HeroPhoto["overlayColor"], CSSProperties> = {
  white: { color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.45), 0 0 18px rgba(0,0,0,0.3)" },
  black: { color: INVITATION_COLORS.ink },
};

/**
 * シルエット写真（2色刷り。Issue #193）。「スクロールのご褒美」として、表紙の下の大きな余白（.invitation-hero-space）の先に出す。
 * 写真の上端が画面の下から 20% ほど入ったら、1.2 秒で下から少し上がりながら浮かび上がる（globals.css の invitation-reveal）。
 * prefers-reduced-motion では動かさず、はじめから出しておく。
 * ★地の灰色・上下のフェードを付けない★ 画像そのものが紙の色で、裾も画像の側で紙に溶かしてあるため（灰色の四角が出る）。
 * ★枠は正方形で先に場所を取り、object-contain で入れる★ 読み込みで画面がずれないように。
 * ★写真の下には何も置かない★ 次の見出しまで INVITATION_HERO.gapBelowPx 空けて、ひと区切りつける。
 * ★重ねる文字は、日付も一言も未設定なら何も出さない★（Issue #193 では使わない。仕組みは残す）
 */
export function InvitationHeroPhoto({ photo }: { photo: HeroPhoto }) {
  const { ref, shown } = useRevealOnce<HTMLDivElement>(0, INVITATION_HERO.revealRootMargin);
  // 次の見出しの上には Section の pt-2（8px）があるので、その分を引く
  return (
    <div style={{ marginBottom: INVITATION_HERO.gapBelowPx - 8 }}>
      <div aria-hidden className="invitation-hero-space" />
      <div
        ref={ref}
        data-shown={shown ? "" : undefined}
        className="invitation-reveal relative mx-auto aspect-square"
        style={{ width: `${INVITATION_HERO.widthPercent}%` }}
      >
        <Image
          src={photoSrc(photo.url)}
          alt={photo.alt}
          fill
          sizes={`(max-width: 416px) ${INVITATION_HERO.widthPercent}vw, 242px`}
          className="object-contain"
        />
        {(photo.overlayDate || photo.overlayText) && (
          <p className="absolute inset-x-0 top-[13%] text-center" style={OVERLAY_STYLE[photo.overlayColor]}>
            {photo.overlayDate && (
              <span className="block font-serif text-[40px] font-medium tracking-[0.12em] tabular-nums">
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
 * ふたりから。1人1段で、写真（4:5・幅 42%）と、その人の名前＋メッセージを横に並べる。写真は1人目が左、2人目が右（以降も交互）。
 * ★写真の隣に、その人の言葉を置く★（Issue #189）誰のメッセージかが一目で分かるように。2列のカードは1行が8〜9文字で、
 *   改行が多かった。いまは1行 12 文字以上入る。
 * ★同じ写真を別の場所で小さく出し直さない★ 試作で、顔のアイコンが重なって分かりにくかったため。
 * ★写真は 4:5★ 顔と手に持ったお酒まで入る大きさにするため。
 *   ops.mjs の PHOTO_FROM_US_WIDTH / PHOTO_FROM_US_HEIGHT（photo set groom|bride で縮める大きさ）と縦横比をそろえる。
 */
export function InvitationFromUsCards({ cards }: { cards: readonly InvitationFromUs[] }) {
  return (
    <ul className="space-y-7">
      {cards.map((c, i) => (
        <li key={i} className={`flex items-start gap-4 ${i % 2 === 1 ? "flex-row-reverse" : ""}`}>
          <span className="relative aspect-[4/5] w-[42%] shrink-0 overflow-hidden rounded-[12px] bg-stone-200">
            {c.photoUrl ? (
              <Image src={photoSrc(c.photoUrl)} alt={c.alt} fill sizes="(max-width: 448px) 42vw, 180px" className="object-cover" />
            ) : (
              // ★写真が未設定なら、名前の頭文字★ 並び（交互）は写真があるときと同じ
              <span aria-hidden className="flex h-full w-full items-center justify-center font-serif text-4xl text-stone-500">
                {Array.from(c.name)[0]}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p>
              <span className="font-serif text-[17px] font-semibold tracking-[0.12em] text-stone-800">{c.name}</span>
              <span className="ml-1 text-[12px] text-stone-500">より</span>
            </p>
            <p className="mt-2 whitespace-pre-line text-justify text-[13.5px] leading-[1.95] text-stone-600">{c.message}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 当日のおたのしみ（アイコンと文字。項目の間を罫線で区切る） */
export function InvitationHighlights({ items }: { items: readonly InvitationHighlight[] }) {
  return (
    <ul>
      {items.map((h, i) => (
        <li key={i} className="flex gap-3.5 py-4" style={i > 0 ? { borderTop: `1px solid ${INVITATION_COLORS.rule}` } : undefined}>
          <span aria-hidden className="mt-0.5 shrink-0 text-stone-500">
            <HighlightIcon kind={h.key} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-[15px] font-semibold tracking-[0.1em] text-stone-800">{h.title}</p>
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
