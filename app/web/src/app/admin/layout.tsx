"use client";

import type { ReactNode } from "react";

/**
 * 管理画面は PC でゲストの名前や ID をコピーして使うので、文字を選べるままにする
 * （ゲスト向けの画面は globals.css で選択を止めている）。contents なのでレイアウトは変わらない。
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="contents select-text">{children}</div>;
}
