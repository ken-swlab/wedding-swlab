"use client";

import { useEffect, useState } from "react";
import { THEME_PREVIEW_EVENT, THEME_PREVIEW_PARAM, decodeTuning, type ThemeTuning } from "@/config/theme";
import { applyPreview, readStoredPreview, storePreview } from "@/lib/theme-preview";

/**
 * デザインのプレビューを、この端末にだけ適用する（Issue #130）。ルートの layout に1つだけ置く。
 *
 * ★適用するのは管理者だけ★
 *   配色は localStorage か URL の ?theme= から読む。どちらも誰でも用意できるので、
 *   ID トークンの admin を確かめてから適用する（管理者でなければ何もしない）。
 *   これは使い勝手のための出し分けで、守るものは無い（色が変わるだけで、秘密は扱わない）。
 * ★プレビューが無ければ何も読み込まない★
 *   全ページに載るので、ふつうのゲストには Firebase の読み込みも購読も足さない。
 *   配色が見つかったときだけ、Auth を動的に読み込んで管理者かどうかを確かめる。
 */
export function ThemePreviewGate() {
  const [active, setActive] = useState<ThemeTuning | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stopAuth: (() => void) | null = null;
    let isAdmin = false;
    // 共有リンク（?theme=）で来た配色。管理者と分かった時点で、この端末に保存する
    let fromUrl = decodeTuning(new URLSearchParams(window.location.search).get(THEME_PREVIEW_PARAM));

    function show() {
      if (cancelled) return;
      const tuning = isAdmin ? (fromUrl ?? readStoredPreview()) : null;
      applyPreview(tuning);
      setActive(tuning);
    }

    async function watchAuth() {
      if (stopAuth) return;
      stopAuth = () => {};
      const [{ auth }, { onIdTokenChanged }] = await Promise.all([import("@/lib/firebase"), import("firebase/auth")]);
      if (cancelled) return;
      stopAuth = onIdTokenChanged(auth, (user) => {
        void (async () => {
          try {
            isAdmin = user ? (await user.getIdTokenResult()).claims.admin === true : false;
          } catch {
            isAdmin = false;
          }
          if (isAdmin && fromUrl) {
            const shared = fromUrl;
            fromUrl = null;
            // 保存できなくても（プライベートブラウズなど）、この画面のあいだは適用する
            if (!storePreview(shared)) {
              applyPreview(shared);
              if (!cancelled) setActive(shared);
              return;
            }
          }
          show();
        })();
      });
    }

    function refresh() {
      if (fromUrl ?? readStoredPreview()) void watchAuth().then(show);
      else show();
    }

    refresh();
    window.addEventListener(THEME_PREVIEW_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(THEME_PREVIEW_EVENT, refresh);
      stopAuth?.();
    };
  }, []);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(0.25rem+env(safe-area-inset-top))] z-[80] flex justify-center px-4">
      <div role="status" className="pointer-events-auto flex items-center gap-2 rounded-full bg-stone-900/90 py-1 pl-3 pr-1 text-[11px] text-white shadow-lg">
        <span>デザインのプレビュー中（この端末だけ）</span>
        <button
          type="button"
          onClick={() => storePreview(null)}
          className="relative min-h-8 touch-manipulation rounded-full bg-white/20 px-3 font-medium after:absolute after:-inset-x-1 after:-inset-y-1.5"
        >
          解除
        </button>
      </div>
    </div>
  );
}
