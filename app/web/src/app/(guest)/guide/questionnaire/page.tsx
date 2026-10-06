"use client";

import Link from "next/link";
import { GuideShell } from "@/components/guide/GuideShell";
import { PlaceholderPanel } from "@/components/guestbook/GuestbookShell";
import { GUIDE_PATHS } from "@/config/guide";

/** 出欠・アレルギーなどのアンケートの確認と変更（中身は Issue #52 で作る） */
export default function GuideQuestionnairePage() {
  return (
    <GuideShell>
      <PlaceholderPanel title="出欠・アンケート">
        招待状でご回答いただいた出欠やアレルギーの確認・変更は、こちらでできるようになる予定です。
      </PlaceholderPanel>
      <Link
        href={GUIDE_PATHS.home}
        className="mt-4 flex min-h-11 touch-manipulation items-center justify-center rounded-full text-sm text-stone-500 transition hover:bg-stone-100"
      >
        ご案内に戻る
      </Link>
    </GuideShell>
  );
}
