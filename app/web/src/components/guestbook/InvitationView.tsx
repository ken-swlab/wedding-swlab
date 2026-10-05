"use client";

import type { CSSProperties } from "react";
import type { InvitationContent } from "@/types/invitation";

/** 上から順にふわっと出す（invitation-rise と組み合わせる）。秒 */
function delay(sec: number): CSSProperties {
  return { animationDelay: `${sec}s` };
}

/** パスコードを通った人に見せる招待状の本文。中身は GET /api/guest/invitation から受け取る */
export function InvitationView({ invitation }: { invitation: InvitationContent }) {
  const { groom, bride, dateLabel, receptionAt, venueName, venueAddress, venueMapUrl, greeting } = invitation;

  return (
    <article>
      <header className="pt-4 text-center">
        <p style={delay(0)} className="invitation-rise text-[11px] tracking-[0.35em] text-stone-400">
          WEDDING INVITATION
        </p>
        <h1 style={delay(0.25)} className="invitation-rise mt-5 font-serif text-[28px] leading-tight text-stone-800">
          {groom}
          <span className="mx-3 text-lg text-stone-400">&amp;</span>
          {bride}
        </h1>
        <div style={delay(0.45)} className="invitation-rise mx-auto mt-6 h-px w-16 bg-stone-300" />
      </header>

      <section className="pt-10 text-center">
        <p style={delay(0.6)} className="invitation-rise font-serif text-sm tracking-widest text-stone-400">ご挨拶</p>
        <div className="mt-5 space-y-2.5">
          {greeting.map((line, i) => (
            <p key={line} style={delay(0.75 + i * 0.12)} className="invitation-rise text-[13.5px] leading-[2] text-stone-600">
              {line}
            </p>
          ))}
        </div>
      </section>

      <section style={delay(0.9 + greeting.length * 0.12)} className="invitation-rise mt-10 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
        <p className="text-center font-serif text-sm tracking-widest text-stone-400">開催概要</p>
        {/* 日時・会場・住所はコピーできるようにする（全体は globals.css で選択を止めている） */}
        <dl className="mt-5 select-text space-y-4 text-[14px]">
          <div>
            <dt className="text-[11px] tracking-widest text-stone-400">日時</dt>
            <dd className="mt-1 text-stone-700">{dateLabel}</dd>
            <dd className="mt-0.5 text-[13px] text-stone-500">{receptionAt}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-widest text-stone-400">会場</dt>
            <dd className="mt-1 text-stone-700">{venueName}</dd>
            <dd className="mt-0.5 text-[13px] leading-relaxed text-stone-500">{venueAddress}</dd>
            {venueMapUrl && (
              <dd className="mt-2">
                <a href={venueMapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-[13px] text-stone-500 underline underline-offset-4">
                  地図を開く
                </a>
              </dd>
            )}
          </div>
        </dl>
      </section>
    </article>
  );
}
