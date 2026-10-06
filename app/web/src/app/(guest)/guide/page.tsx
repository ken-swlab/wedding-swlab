"use client";

import { GuideShell } from "@/components/guide/GuideShell";
import { PlaceholderPanel } from "@/components/guestbook/GuestbookShell";

/** 案内モードのトップ（中身は Issue #51 以降で作る） */
export default function GuidePage() {
  return (
    <GuideShell>
      <PlaceholderPanel title="ご案内">会場・集合時間・お料理などのご案内は、こちらに表示される予定です。</PlaceholderPanel>
    </GuideShell>
  );
}
