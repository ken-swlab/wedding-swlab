"use client";

import type { CSSProperties, ReactNode } from "react";
import { INVITATION_COLORS, INVITATION_PEEK_PX } from "@/config/invitation";
import { useSeenOnce } from "@/hooks/useSeenOnce";
import { weekdayOf } from "@/lib/invitation-program";
import type { InvitationContent, OpeningContent } from "@/types/invitation";
import { InvitationFromUsCards, InvitationHeroPhoto, InvitationHighlights } from "./InvitationExtras";
import { InvitationSection as Section, InvitationVenue } from "./InvitationSections";
import { ProgramList } from "./ProgramList";

/** 上から順にふわっと出す（invitation-rise と組み合わせる）。秒 */
function delay(sec: number): CSSProperties {
  return { animationDelay: `${sec}s` };
}

/**
 * パスコードを通った人に見せる招待状の本文（Issue #166 で作り直した）。中身は GET /api/guest/invitation から受け取る。
 *
 *   1画面目 … WEDDING INVITATION・ふたりの名前・日付と曜日・会場の短い表記・SCROLL（スクロールなしで見える範囲）。
 *            高さは画面より INVITATION_PEEK_PX 低くし、続きがあると分かるようにする（Issue #178）。
 *            シルエット写真は、その下の大きな余白の先に出す（Issue #193。1画面目にはのぞかせない）
 *   その先 … シルエット写真・FROM US（ふたりから）・当日のおたのしみ（Issue #173）・PROGRAM（当日の流れ）・
 *            MESSAGE（以前のご挨拶。showGreeting のときだけ）・VENUE（会場・地図・2次会の会場・会費）
 *
 * ★飛び込みの直後に読む場所なので、説明文を置かない★ 出欠の回答はエントリー画面（InvitationFlow）に分けた。
 * ★名前・日付・会場は props でだけ受け取る★ 定数として書かない（公開リポジトリ。CLAUDE.md ルール 4a）。
 *   日付と会場の短い表記は opening（オープニングの「招集」と同じもの）から。
 * ★書体は CLAUDE.md の書体ルール★（Issue #189）目に留めるもの（名前・日付・見出し・会場名・会費）は明朝、
 *   読み流すもの（住所・補足）と押すもの（地図を開く）はゴシック。MONO（電光掲示板の書体）は使わない。
 *   白いカードは使わず、項目の間を罫線（INVITATION_COLORS.rule）で区切る。
 */
export function InvitationView({
  invitation,
  opening,
  rise = true,
  onCueSeen,
  footer,
}: {
  invitation: InvitationContent;
  opening: OpeningContent;
  /** 1画面目を上から順にふわっと出すか。水が引いて現れたあと（Issue #165）は false（出しきった状態で描く） */
  rise?: boolean;
  /**
   * 「当日のおたのしみ」（無ければ PROGRAM）が画面に入った（一度だけ。Issue #178）。
   * 画面下の「エントリーする」を、ここまで読んでから出すために使う。
   */
  onCueSeen?: () => void;
  /** ページの一番下（VENUE の下）に置くもの（エントリーするのボタン。Issue #178） */
  footer?: ReactNode;
}) {
  const { groom, bride, greeting, program, photos, fromUs, highlights, showGreeting } = invitation;
  const weekday = weekdayOf(opening.date);
  const cueRef = useSeenOnce<HTMLElement>(onCueSeen);

  return (
    <article className={`text-stone-800 ${rise ? "" : "invitation-static"}`}>
      <header
        className="relative flex flex-col items-center justify-center px-6 pb-20 pt-16 text-center"
        style={{ minHeight: `calc(100dvh - ${INVITATION_PEEK_PX}px)` }}
      >
        <p style={delay(0)} className="invitation-rise font-serif text-[length:calc(11px*var(--inv-scale))] font-medium tracking-[0.4em] text-stone-500">
          WEDDING INVITATION
        </p>
        <h1 style={delay(0.2)} className="invitation-rise mt-6 font-serif font-medium leading-tight">
          <span className="block text-[length:calc(32px*var(--inv-scale))] tracking-[0.1em]">{groom}</span>
          <span className="my-1.5 block text-[length:calc(22px*var(--inv-scale))]" style={{ color: INVITATION_COLORS.gold }}>
            &amp;
          </span>
          <span className="block text-[length:calc(32px*var(--inv-scale))] tracking-[0.1em]">{bride}</span>
        </h1>
        {/* ★日付は名前より目立たせない★（Issue #189）名前が先に目に入るように、小さく・色を一段薄く */}
        <p style={delay(0.45)} className="invitation-rise mt-7 font-serif text-[length:calc(24px*var(--inv-scale))] font-medium tracking-[0.12em] tabular-nums text-stone-700">
          {opening.date}
          {weekday && <small className="ml-1.5 text-[length:calc(12px*var(--inv-scale))] font-normal tracking-[0.2em] text-stone-500">{weekday}</small>}
        </p>
        <p style={delay(0.6)} className="invitation-rise mt-2 font-serif text-[length:calc(12px*var(--inv-scale))] tracking-[0.45em] text-stone-500">
          {opening.venue}
        </p>
        {/* 1画面目の下端の少し上。2回目以降は最初から出る画面下の「エントリーする」（下から 80px ほど）にもかぶらない */}
        <div aria-hidden className="absolute inset-x-0 bottom-6 text-[length:calc(10px*var(--inv-scale))] tracking-[0.3em] text-stone-500">
          SCROLL
          <span className="invitation-scroll-cue mx-auto mt-2 block h-[26px] w-px bg-stone-400" />
        </div>
      </header>

      {/* ★写真が未設定なら枠ごと出さない★（Issue #173）。上の大きな余白（Issue #193）も一緒に出さない */}
      {photos?.hero?.url && <InvitationHeroPhoto photo={photos.hero} />}

      {fromUs.length > 0 && (
        <Section title="FROM US">
          <InvitationFromUsCards cards={fromUs} />
        </Section>
      )}

      {highlights.length > 0 && (
        <Section title="当日のおたのしみ" sectionRef={cueRef}>
          <InvitationHighlights items={highlights} />
        </Section>
      )}

      <Section title="PROGRAM" sectionRef={highlights.length > 0 ? undefined : cueRef}>
        <ProgramList program={program} />
      </Section>

      {/* 以前のご挨拶（Issue #173 で、ふたりからに置き換えた）。データは残し、showGreeting で戻せる */}
      {showGreeting && (
        <Section title="MESSAGE">
          <div className="space-y-1 text-center font-serif text-sm leading-[2.1] text-stone-600">
            {greeting.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </Section>
      )}

      <Section title="VENUE">
        <InvitationVenue invitation={invitation} />
      </Section>

      {footer && <div className="px-5 pb-2 pt-3">{footer}</div>}
    </article>
  );
}
