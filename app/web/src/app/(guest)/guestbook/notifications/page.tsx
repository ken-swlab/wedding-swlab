"use client";

import { GuestbookShell, PlaceholderPanel } from "@/components/guestbook/GuestbookShell";

export default function NotificationsPage() {
  return (
    <GuestbookShell>
      <PlaceholderPanel title="通知">
        いいねやコメントのお知らせは、こちらに表示される予定です。
      </PlaceholderPanel>
    </GuestbookShell>
  );
}
