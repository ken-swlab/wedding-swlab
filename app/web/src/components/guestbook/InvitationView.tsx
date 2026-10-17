"use client";

import type { CSSProperties, ReactNode } from "react";
import { INVITATION_COLORS } from "@/config/invitation";
import { weekdayOf } from "@/lib/invitation-program";
import type { InvitationContent, OpeningContent } from "@/types/invitation";
import { InvitationFromUsCards, InvitationHeroPhoto, InvitationHighlights } from "./InvitationExtras";
import { ProgramList } from "./ProgramList";

const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

/** 上から順にふわっと出す（invitation-rise と組み合わせる）。秒 */
function delay(sec: number): CSSProperties {
  return { animationDelay: `${sec}s` };
}

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

/**
 * パスコードを通った人に見せる招待状の本文（Issue #166 で作り直した）。中身は GET /api/guest/invitation から受け取る。
 *
 *   1画面目 … WEDDING INVITATION・ふたりの名前・日付と曜日・会場の短い表記・SCROLL（スクロールなしで見える範囲）
 *   その先 … シルエット写真・FROM US（ふたりから）・当日のおたのしみ（Issue #173）・PROGRAM（当日の流れ）・
 *            MESSAGE（以前のご挨拶。showGreeting のときだけ）・VENUE（会場・地図・会費）
 *
 * ★飛び込みの直後に読む場所なので、説明文を置かない★ 出欠の回答はエントリー画面（InvitationFlow）に分けた。
 * ★名前・日付・会場は props でだけ受け取る★ 定数として書かない（公開リポジトリ。CLAUDE.md ルール 4a）。
 *   日付と会場の短い表記は opening（オープニングの「招集」と同じもの）から。
 */
export function InvitationView({
  invitation,
  opening,
  rise = true,
}: {
  invitation: InvitationContent;
  opening: OpeningContent;
  /** 1画面目を上から順にふわっと出すか。水が引いて現れたあと（Issue #165）は false（出しきった状態で描く） */
  rise?: boolean;
}) {
  const { groom, bride, venueName, venueAddress, venueMapUrl, greeting, program, fee, photos, fromUs, highlights, showGreeting } = invitation;
  const weekday = weekdayOf(opening.date);

  return (
    <article className={`text-stone-800 ${rise ? "" : "invitation-static"}`}>
      <header className="relative flex min-h-dvh flex-col items-center justify-center px-6 pb-28 pt-16 text-center">
        <p style={delay(0)} className="invitation-rise text-[10px] tracking-[0.45em] text-stone-500">
          WEDDING INVITATION
        </p>
        <h1 style={delay(0.2)} className="invitation-rise mt-6 font-serif leading-tight">
          <span className="block text-[34px] tracking-[0.08em]">{groom}</span>
          <span className="my-1.5 block text-xl" style={{ color: INVITATION_COLORS.amp }}>
            &amp;
          </span>
          <span className="block text-[34px] tracking-[0.08em]">{bride}</span>
        </h1>
        <p style={{ ...delay(0.45), fontFamily: MONO }} className="invitation-rise mt-7 text-[30px] font-bold tracking-[0.12em] tabular-nums">
          {opening.date}
          {weekday && <small className="ml-1.5 text-[13px] font-normal tracking-[0.2em] text-stone-500">{weekday}</small>}
        </p>
        <p style={delay(0.6)} className="invitation-rise mt-2 text-sm tracking-[0.2em] text-stone-500">
          {opening.venue}
        </p>
        {/* 画面下の「エントリーする」の上に出す */}
        <div aria-hidden className="absolute inset-x-0 text-[10px] tracking-[0.3em] text-stone-500" style={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
          SCROLL
          <span className="invitation-scroll-cue mx-auto mt-2 block h-[26px] w-px bg-stone-400" />
        </div>
      </header>

      {/* ★写真が未設定なら枠ごと出さない★（Issue #173） */}
      {photos?.hero?.url && <InvitationHeroPhoto photo={photos.hero} />}

      {fromUs.length > 0 && (
        <Section title="FROM US">
          <InvitationFromUsCards cards={fromUs} />
        </Section>
      )}

      {highlights.length > 0 && (
        <Section title="当日のおたのしみ">
          <InvitationHighlights items={highlights} />
        </Section>
      )}

      <Section title="PROGRAM">
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
        <div className="selectable rounded-2xl border border-stone-200/80 bg-white p-4 text-[13px] leading-[1.8]">
          <b className="text-[14px] text-stone-800">{venueName}</b>
          <p className="text-stone-600">{venueAddress}</p>
          {venueMapUrl && (
            <a href={venueMapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[12.5px] text-stone-500 underline underline-offset-4">
              地図を開く
            </a>
          )}
          {/* 会費（Issue #148）。金額は config/payment。未設定なら出さない。お車代の額は出さない */}
          {fee && (
            <dl className="mt-3 border-t border-stone-100 pt-3">
              <dt className="text-[10.5px] tracking-[0.2em] text-stone-500">会費</dt>
              <dd className="mt-0.5 text-[14px] text-stone-700">
                会食 {yen(fee.partyYen)} ／ 2次会 {yen(fee.secondYen)}
              </dd>
            </dl>
          )}
        </div>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-5 pb-7 pt-2">
      <h2 className="mb-[18px] text-center text-[10px] font-semibold tracking-[0.4em] text-stone-500">{title}</h2>
      {children}
    </section>
  );
}
