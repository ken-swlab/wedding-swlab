"use client";

import { GuestbookShell, PlaceholderPanel } from "@/components/guestbook/GuestbookShell";

export default function SettingsPage() {
  return (
    <GuestbookShell>
      <PlaceholderPanel title="設定">
        表示名やアイコンなどの設定は、こちらに表示される予定です。
      </PlaceholderPanel>
    </GuestbookShell>
  );
}
