"use client";

import type { CSSProperties, ReactNode, Ref } from "react";
import { INVITATION_COLORS } from "@/config/invitation";
import type { InvitationContent } from "@/types/invitation";

/**
 * 招待状の本文の部品（Issue #241 で InvitationView から切り出した）。
 * ★招待状（InvitationView）と当日のご案内（/guide/details）の両方で使う★ 同じ見た目を二重に書かない。
 *   ここを変えると両方が変わる。招待状の見た目を変えたくないときは、使う側（props）で分ける。
 * ★文字の大きさは --inv-scale 倍、押せる部品の高さは --inv-tap★（Issue #240）親族用の招待状（.inv-family）では大きくなり、
 *   ご案内（招待状の外）では 1 倍・44px のまま（globals.css の .inv-family の★）。
 */

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

/** 項目の間の罫線（白いカードの代わり。Issue #189） */
const RULE_TOP: CSSProperties = { borderTop: `1px solid ${INVITATION_COLORS.rule}` };
/** VENUE の小見出し（2次会・会費） */
const SUBHEAD = "font-serif text-[length:calc(11px*var(--inv-scale))] tracking-[0.3em] text-stone-500";

/** 見出し（PROGRAM・VENUE など。明朝・字間広め）と中身 */
export function InvitationSection({ title, children, sectionRef }: { title: string; children: ReactNode; sectionRef?: Ref<HTMLElement> }) {
  return (
    <section ref={sectionRef} className="px-5 pb-7 pt-2">
      <h2 className="mb-[18px] text-center font-serif text-[length:calc(12px*var(--inv-scale))] font-medium tracking-[0.42em] text-stone-600">{title}</h2>
      {children}
    </section>
  );
}

/**
 * VENUE の中身: 会場名・住所・地図を開く、2次会の会場、会費の一行。
 * 2次会・会費は、データに無ければ出さない（親族用の招待状は、どちらも返さない作りにする）。
 * feeNote: 会費の一行の下に添えるもの（当日のご案内の「会費」タブへのリンク）。招待状では渡さない。
 */
export function InvitationVenue({
  invitation,
  feeNote,
}: {
  invitation: Pick<InvitationContent, "venueName" | "venueAddress" | "venueMapUrl" | "afterParty" | "fee">;
  feeNote?: ReactNode;
}) {
  const { venueName, venueAddress, venueMapUrl, afterParty, fee } = invitation;
  return (
    <div className="selectable text-[length:calc(13px*var(--inv-scale))] leading-[1.8]">
      <p className="font-serif text-[length:calc(16px*var(--inv-scale))] font-semibold text-stone-800">{venueName}</p>
      <p className="text-stone-600">{venueAddress}</p>
      {venueMapUrl && <MapLink href={venueMapUrl} />}
      {/* 2次会の会場。1次会の下に出す。未設定なら出さない */}
      {afterParty && (
        <div className="mt-3 pt-3" style={RULE_TOP}>
          <p className={SUBHEAD}>2次会</p>
          <p className="mt-0.5 font-serif text-[length:calc(16px*var(--inv-scale))] font-semibold text-stone-800">{afterParty.venueName}</p>
          {afterParty.venueAddress && <p className="text-stone-600">{afterParty.venueAddress}</p>}
          {afterParty.venueMapUrl && <MapLink href={afterParty.venueMapUrl} />}
        </div>
      )}
      {/* 会費（Issue #148）。金額は config/payment。未設定なら出さない。お車代の額は出さない */}
      {fee && (
        <dl className="mt-3 pt-3" style={RULE_TOP}>
          <dt className={SUBHEAD}>会費</dt>
          <dd className="mt-0.5 font-serif text-[length:calc(14px*var(--inv-scale))] text-stone-700">
            会食 {yen(fee.partyYen)} ／ 2次会 {yen(fee.secondYen)}
          </dd>
          {feeNote && <dd>{feeNote}</dd>}
        </dl>
      )}
    </div>
  );
}

function MapLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[var(--inv-tap)] items-center text-[length:calc(12px*var(--inv-scale))] text-stone-500 underline underline-offset-4">
      地図を開く
    </a>
  );
}
