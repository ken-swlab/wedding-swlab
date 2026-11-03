import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GuestbookDataProvider } from "@/components/guestbook/GuestbookDataProvider";
import { GUESTBOOK_TITLE } from "@/config/guestbook";

/**
 * ★サーバーコンポーネントにする（"use client" を付けない）★ metadata はサーバーコンポーネントからしか出せない。
 *   中の GuestbookDataProvider はクライアントのまま動く。
 * タイトルは招待後のもの（Issue #226。GUESTBOOK_TITLE の★参照）。ルートの「WEDDING INVITATION」を上書きする。
 */
export const metadata: Metadata = { title: GUESTBOOK_TITLE };

/** /guestbook 以下で投稿一覧を共有する（GuestbookDataProvider の★参照） */
export default function GuestbookLayout({ children }: { children: ReactNode }) {
  return <GuestbookDataProvider>{children}</GuestbookDataProvider>;
}
