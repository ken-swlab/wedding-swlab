"use client";

import { GuideShell } from "@/components/guide/GuideShell";
import { PlaceholderPanel } from "@/components/guestbook/GuestbookShell";

/**
 * 座席表（中身は Issue #51 以降で作る）。
 * 出席者の一覧はコミュニティの「仲間」（/guestbook/community。Issue #174）が担うので、ここは座席だけ。
 */
export default function GuideGuestsPage() {
  return (
    <GuideShell>
      <PlaceholderPanel title="座席">座席表は当日までにこちらに表示される予定です。</PlaceholderPanel>
    </GuideShell>
  );
}
