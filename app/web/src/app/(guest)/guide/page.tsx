"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { GuideShell } from "@/components/guide/GuideShell";
import { GUIDE_PATHS } from "@/config/guide";
import { FormIcon, MapPinIcon } from "@/components/icons";

/** 案内モードのトップ。項目の一覧（出欠・アンケート、当日のご案内。Issue #241） */
export default function GuidePage() {
  return (
    <GuideShell>
      {/* カードにせず、罫線で区切った行にする（Issue #236）。アンケートはタブに無いので、ここから開く */}
      <ul className="-mx-4 border-t border-stone-200">
        <GuideRow href={GUIDE_PATHS.questionnaire} icon={<FormIcon className="h-7 w-7 text-stone-700" />} title="出欠・アンケート" note="出欠やアレルギーのご回答の確認・変更" />
        <GuideRow href={GUIDE_PATHS.details} icon={<MapPinIcon className="h-7 w-7 text-stone-700" />} title="当日のご案内" note="日時・会場・地図" />
      </ul>
    </GuideShell>
  );
}

function GuideRow({ href, icon, title, note }: { href: string; icon: ReactNode; title: string; note: string }) {
  return (
    <li className="border-b border-stone-200">
      <Link href={href} className="flex min-h-16 touch-manipulation items-center gap-3 px-4 py-4 transition hover:bg-stone-100/60">
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-stone-900">{title}</span>
          <span className="block text-xs text-stone-500">{note}</span>
        </span>
        <span aria-hidden className="text-stone-400">›</span>
      </Link>
    </li>
  );
}
