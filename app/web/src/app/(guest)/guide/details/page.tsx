"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GuideShell } from "@/components/guide/GuideShell";
import { InvitationSection, InvitationVenue } from "@/components/guestbook/InvitationSections";
import { InvitationHighlights } from "@/components/guestbook/InvitationExtras";
import { ProgramList } from "@/components/guestbook/ProgramList";
import { getJson } from "@/lib/api-client";
import { weekdayOf } from "@/lib/invitation-program";
import { GUIDE_PATHS } from "@/config/guide";
import type { InvitationStatus } from "@/types/invitation";

type Load = { state: "loading" } | { state: "error" } | { state: "pending" } | { state: "ready"; data: Required<Pick<InvitationStatus, "invitation" | "opening">> };

/**
 * 当日のご案内（Issue #241）。招待状の中身のうち、時間と場所だけを出す。
 *
 * ★データと部品は招待状と同じ★ 中身は GET /api/guest/invitation（招待状と同じ。パスコードを通った人にだけ返す）、
 *   見た目は招待状の部品（ProgramList・InvitationVenue・InvitationHighlights）。ops invitation set で変えると、
 *   招待状とこの画面の両方が変わる。
 * ★出さないもの★ 表紙の名前・ふたりの写真（hero）・FROM US・ご挨拶・エントリーのボタン・オープニング。
 * ★親族用は API が決める★（Issue #240）?kind= を付けずに呼ぶと、API は本人が答えたときの種類（guestPrivate.invitationKind）で
 *   選ぶので、親族用の招待状から答えた人には config/invitation_family の流れと会場が返る。会費は返さず、親族用には
 *   2次会も無いので、その行は出ない（InvitationVenue は無ければ出さない）。親族用が未設定なら ready: false で「準備中」
 *   （友人用の時刻・会場で代わりに出さない）。
 * ★文字の大きさは (guest)/layout が <html> に付ける★（Issue #243。親族用から入った人は既定で大きい）
 */
export default function GuideDetailsPage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getJson<InvitationStatus>("/api/guest/invitation")
      .then((s) => {
        if (cancelled) return;
        if (s.invitation && s.opening) setLoad({ state: "ready", data: { invitation: s.invitation, opening: s.opening } });
        else setLoad(s.cleared ? { state: "pending" } : { state: "error" });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLoad({ state: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return (
    <GuideShell>
      <h1 className="mb-4 font-serif text-xl tracking-wide text-stone-900">当日のご案内</h1>
      {load.state === "loading" && <div className="h-40 animate-pulse rounded-2xl bg-stone-200/60" />}
      {load.state === "error" && (
        <div role="alert" className="py-6 text-center">
          <p className="text-sm text-stone-600">ご案内を読み込めませんでした。もう一度お試しください</p>
          <button type="button" onClick={retry} className="mt-4 min-h-[var(--inv-tap)] touch-manipulation rounded-full bg-stone-900 px-6 text-sm font-medium text-white hover:bg-stone-700">
            再読み込み
          </button>
        </div>
      )}
      {load.state === "pending" && <p className="py-6 text-center text-sm text-stone-500">ご案内は準備中です。</p>}
      {load.state === "ready" && <Details {...load.data} />}
    </GuideShell>
  );
}

function Details({ invitation, opening }: Required<Pick<InvitationStatus, "invitation" | "opening">>) {
  const weekday = weekdayOf(opening.date);
  return (
    // 招待状の部品は左右 px-5 を持つので、枠の px-4 の外まで広げて招待状と同じ余白にする
    <div className="-mx-4 text-stone-800">
      {/* 日付と会場の一行（招待状の表紙と同じ値。明朝） */}
      {/* ★日付と会場は、それぞれ途中で折り返さない★ 狭い画面では「／」のところで2行に分かれる */}
      <p className="border-b border-stone-200 px-5 pb-5 text-center font-serif text-[length:calc(17px*var(--inv-scale))] tracking-[0.08em] tabular-nums text-stone-800">
        <span className="whitespace-nowrap">
          {opening.date}
          {weekday && <span className="ml-1.5 text-[length:calc(12px*var(--inv-scale))] tracking-[0.2em] text-stone-500">{weekday}</span>}
          <span className="mx-2 text-stone-400">／</span>
        </span>{" "}
        <span className="whitespace-nowrap">{opening.venue}</span>
      </p>
      <div className="pt-6">
        <InvitationSection title="PROGRAM">
          <ProgramList program={invitation.program} />
        </InvitationSection>
        <InvitationSection title="VENUE">
          <InvitationVenue
            invitation={invitation}
            feeNote={
              // 内訳は「会費」タブにある。ここは一行だけ
              <Link href={GUIDE_PATHS.payment} className="inline-flex min-h-[var(--inv-tap)] items-center text-[length:calc(12px*var(--inv-scale))] text-stone-500 underline underline-offset-4">
                会費の詳しい内訳を見る
              </Link>
            }
          />
        </InvitationSection>
        {invitation.highlights.length > 0 && (
          <InvitationSection title="当日のおたのしみ">
            <InvitationHighlights items={invitation.highlights} />
          </InvitationSection>
        )}
      </div>
    </div>
  );
}
