import { notFound } from "next/navigation";
import { emulatorServerReady } from "@/lib/emulator-server";
import { DevLoginPanel } from "./DevLoginPanel";

/**
 * 開発用ログイン（Issue #83）。LINE を使わず、エミュレーターのテスト用アカウントで入る。
 *
 * ★このページだけはサーバーコンポーネントにする★
 *   エミュレーターで動かしていないとき（本番・プレビュー・ふつうの npm run dev）に、
 *   画面を出さず 404 にするため。notFound() はサーバー側でしか呼べない。
 *   ボタンなどの中身は DevLoginPanel（"use client"）に分けている。
 */
export default function DevLoginPage() {
  if (!emulatorServerReady()) notFound();
  return <DevLoginPanel />;
}
