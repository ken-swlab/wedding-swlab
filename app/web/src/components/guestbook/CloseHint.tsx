"use client";

import { useState } from "react";
import { postJson } from "@/lib/api-client";
import { useGuestSessionContext } from "./GuestSessionContext";

/** LINE のアプリ内ブラウザか（上のバーに ↓ があるのはここだけ）。User-Agent に「Line/」が入る */
function inLineApp(): boolean {
  return typeof navigator !== "undefined" && /\bLine\//i.test(navigator.userAgent);
}

/**
 * 「閉じるときは、左上の ↓ を押すと、すぐに戻ってこられます」（Issue #273）。
 *
 * ★LINE のアプリ内ブラウザの中だけ、一度だけ★ 閉じたら本人の設定（guestPrivate.closeHintSeen）に記録し、二度と出さない。
 *   ↓ は LINE の画面上の小さな丸にしまう（ページが残る）。× の場所の説明はしない（× で閉じても、最後に見ていた画面へ戻るので困らない）。
 * ★承認後の写真の演出（WelcomeMoment）が済んでから出す★ 出すかどうかは呼び出し側（ready）が決める。
 * 上のほうに小さく出す（カードにしない。罫線で区切る）。
 */
export function CloseHint({ ready }: { ready: boolean }) {
  const { closeHintSeen, privateReady } = useGuestSessionContext();
  const [dismissed, setDismissed] = useState(false);
  const [inLine] = useState(inLineApp);
  if (!ready || !privateReady || closeHintSeen || dismissed || !inLine) return null;
  const close = () => {
    setDismissed(true);
    postJson("/api/guest/preferences", { closeHintSeen: true }).catch((e: unknown) =>
      console.error("[close-hint] 閉じた印の保存に失敗しました", e),
    );
  };
  return (
    <div role="note" className="-mx-4 flex items-center gap-3 border-b border-stone-200 px-4 pb-2">
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-stone-600">
        閉じるときは、左上の <span className="font-semibold text-stone-900">↓</span> を押すと、すぐに戻ってこられます
      </p>
      <button type="button" onClick={close} aria-label="この案内を閉じる" className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center text-stone-400 hover:text-stone-600">
        ×
      </button>
    </div>
  );
}
