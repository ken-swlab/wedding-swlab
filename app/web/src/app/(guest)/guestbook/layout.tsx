"use client";

import type { ReactNode } from "react";
import { GuestbookDataProvider } from "@/components/guestbook/GuestbookDataProvider";

/** /guestbook 以下で投稿一覧を共有する（GuestbookDataProvider の★参照） */
export default function GuestbookLayout({ children }: { children: ReactNode }) {
  return <GuestbookDataProvider>{children}</GuestbookDataProvider>;
}
