"use client";

import Link from "next/link";
import { GuideShell } from "@/components/guide/GuideShell";
import { PlaceholderPanel } from "@/components/guestbook/GuestbookShell";
import { GUIDE_PATHS } from "@/config/guide";

/** 案内モードのトップ（会場・集合時間・お料理などの総合案内。中身は今後の Issue で作る） */
export default function GuidePage() {
  return (
    <GuideShell>
      <PlaceholderPanel title="ご案内">会場・集合時間・お料理などのご案内は、こちらに表示される予定です。</PlaceholderPanel>

      {/* アンケートはタブに無いので、ここから開く */}
      <Link
        href={GUIDE_PATHS.questionnaire}
        className="mt-4 flex min-h-16 touch-manipulation items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm transition hover:bg-stone-50"
      >
        <span aria-hidden className="text-2xl leading-none">📝</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-stone-900">出欠・アンケート</span>
          <span className="block text-xs text-stone-500">出欠やアレルギーのご回答の確認・変更</span>
        </span>
        <span aria-hidden className="text-stone-400">›</span>
      </Link>
    </GuideShell>
  );
}
