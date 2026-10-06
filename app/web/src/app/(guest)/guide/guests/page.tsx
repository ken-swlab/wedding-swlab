"use client";

import { GuideShell } from "@/components/guide/GuideShell";
import { PlaceholderPanel } from "@/components/guestbook/GuestbookShell";

/** 出席者一覧・座席表（中身は Issue #51 以降で作る） */
export default function GuideGuestsPage() {
  return (
    <GuideShell>
      <PlaceholderPanel title="出席者・座席">出席者の一覧と座席表は、こちらに表示される予定です。</PlaceholderPanel>
    </GuideShell>
  );
}
