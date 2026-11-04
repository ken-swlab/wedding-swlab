"use client";

import { useState } from "react";
import { postJson } from "@/lib/api-client";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { effectiveTextScale, type TextScale } from "@/config/text-scale";

/**
 * マイページの「文字を大きくする」（Issue #243）。オンにすると、ゲストの画面ぜんぶの文字が約 1.12 倍になる。
 * ★既定は、親族用から入った人はオン・友人はオフ★（config/text-scale.ts の effectiveTextScale）
 * ★保存は /api/guest/preferences（guestPrivate.textScale）★ 保存した値は useGuestSession の購読で戻り、
 *   (guest)/layout が <html> の data-text-scale を付け替える。押した直後は、戻るのを待たずに表示を切り替える。
 */
export function TextScaleSwitch() {
  const { textScale, invitationKind } = useGuestSessionContext();
  const [pending, setPending] = useState<TextScale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saved = effectiveTextScale(textScale, invitationKind);
  // 保存中・購読で戻るまでは押した値を出す（戻ったら pending と saved が同じになる）
  const on = (pending ?? saved) === "large";

  async function toggle() {
    const next: TextScale = on ? "normal" : "large";
    setPending(next);
    setError(null);
    // 押してすぐ大きさを変える（購読で戻ると (guest)/layout が同じ値を付け直す）
    if (next === "large") document.documentElement.dataset.textScale = "large";
    else delete document.documentElement.dataset.textScale;
    try {
      await postJson("/api/guest/preferences", { textScale: next });
    } catch (e) {
      setPending(null);
      if (saved === "large") document.documentElement.dataset.textScale = "large";
      else delete document.documentElement.dataset.textScale;
      setError(e instanceof Error ? e.message : "保存できませんでした");
    }
  }

  return (
    <div>
      <div className="flex min-h-[var(--inv-tap)] items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-800">文字を大きくする</p>
          <p className="mt-0.5 text-xs leading-relaxed text-stone-500">ゲストブックとご案内の文字を、ひとまわり大きくします</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="文字を大きくする"
          onClick={() => void toggle()}
          className="relative flex h-11 w-16 shrink-0 touch-manipulation items-center justify-center"
        >
          <span aria-hidden className={`relative block h-7 w-12 rounded-full transition-colors ${on ? "bg-stone-900" : "bg-stone-300"}`}>
            <span className={`absolute top-0.5 block h-6 w-6 rounded-full bg-white shadow transition-[left] motion-reduce:transition-none ${on ? "left-[1.375rem]" : "left-0.5"}`} />
          </span>
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
