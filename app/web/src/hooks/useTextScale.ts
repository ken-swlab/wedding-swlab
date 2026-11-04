"use client";

import { useEffect } from "react";
import { TEXT_SCALE_STORAGE_KEY, type TextScale } from "@/config/text-scale";

/**
 * <html> に data-text-scale を付ける（Issue #243。config/text-scale.ts の★参照）。
 * scale が null（まだ分からない）の間は、この端末で最後に使った大きさを出しておく。
 * ★画面を離れたら外す★ 管理画面・/screen（プロジェクター）を大きくしない。
 */
export function useTextScale(scale: TextScale | null) {
  useEffect(() => {
    const root = document.documentElement;
    let value = scale;
    if (value === null) {
      try {
        value = window.localStorage.getItem(TEXT_SCALE_STORAGE_KEY) === "large" ? "large" : "normal";
      } catch {
        value = "normal";
      }
    } else {
      try {
        window.localStorage.setItem(TEXT_SCALE_STORAGE_KEY, value);
      } catch {
        /* 覚えられなくても表示は変える */
      }
    }
    if (value === "large") root.dataset.textScale = "large";
    else delete root.dataset.textScale;
    return () => {
      delete root.dataset.textScale;
    };
  }, [scale]);
}
