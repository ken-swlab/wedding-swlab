import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GUESTBOOK_TITLE } from "@/config/guestbook";

/**
 * /guide 以下（ご案内）のタイトルを、招待後のものにする（Issue #226。GUESTBOOK_TITLE の★参照）。
 * タイトルを出すためだけの層。中身はそのまま出す（"use client" を付けない。metadata はサーバーコンポーネントから出す）。
 */
export const metadata: Metadata = { title: GUESTBOOK_TITLE };

export default function GuideLayout({ children }: { children: ReactNode }) {
  return children;
}
