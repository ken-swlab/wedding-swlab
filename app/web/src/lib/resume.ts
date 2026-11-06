"use client";

import { isGuestbookPath, RESUME_MAX_AGE_MS } from "@/config/guestbook";
import { isGuidePath } from "@/config/guide";

/**
 * 閉じても、元の場所にすぐ戻る（Issue #273）。
 *
 * LINE のアプリ内ブラウザを × や下に引いて閉じると、次は最初から読み込みになる。最後に見ていた画面（パス）と
 * スクロール位置を端末（localStorage）に覚え、開き直したとき（ゲストブックの入口から入ってきたとき）にそこへ移る。
 *
 * ★覚えるのはパスと位置だけ★ 個人情報は入れない（uid は、別のアカウントで開いたときに使わないための印）。
 * ★24 時間（RESUME_MAX_AGE_MS）以上たっていたら使わない★ ゲストブックのトップから始める。
 * ★サインアウト（clearDeviceData）で消す★（lib/firebase.ts）
 */
const KEY = "wb:last-screen";

type Saved = { uid: string; path: string; y: number; at: number };

/** 覚えてよい画面か（ゲストブック・ご案内の中だけ） */
function resumable(path: string): boolean {
  return isGuestbookPath(path) || isGuidePath(path);
}

export function saveLastScreen(uid: string, path: string, y: number) {
  if (!resumable(path)) return;
  try {
    const v: Saved = { uid, path, y: Math.max(0, Math.round(y)), at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* プライベートモードなどで書けなくても続ける */
  }
}

/** 戻る先（無い・古い・別のアカウントなら null） */
export function readLastScreen(uid: string): { path: string; y: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Saved>;
    if (v.uid !== uid || typeof v.path !== "string" || typeof v.at !== "number" || typeof v.y !== "number") return null;
    if (Date.now() - v.at > RESUME_MAX_AGE_MS || !resumable(v.path)) return null;
    return { path: v.path, y: v.y };
  } catch {
    return null;
  }
}

export function clearLastScreen() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 消せなくても続ける */
  }
}
