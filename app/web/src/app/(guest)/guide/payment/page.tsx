"use client";

import { GuideShell } from "@/components/guide/GuideShell";
import { PlaceholderPanel } from "@/components/guestbook/GuestbookShell";

/** Web ご祝儀・送金の状況（中身は Issue #51 以降で作る） */
export default function GuidePaymentPage() {
  return (
    <GuideShell>
      <PlaceholderPanel title="ご祝儀">Web ご祝儀と送金の状況は、こちらに表示される予定です。</PlaceholderPanel>
    </GuideShell>
  );
}
