import type { CSSProperties } from "react";
import {
  SHADES,
  THEME_PREVIEW_EVENT,
  THEME_PREVIEW_STORAGE_KEY,
  THEME_ROLES,
  decodeTuning,
  encodeTuning,
  oklchCss,
  oklchToHex,
  oklchToSrgb,
  roleScale,
  type Oklch,
  type ThemeTuning,
} from "@/config/theme";

/**
 * デザインのプレビュー（Issue #130）。ブラウザの中だけで完結し、サーバーには何も送らない。
 *
 * ★本番のゲストの表示には影響しない★
 *   配色はこの端末の localStorage と URL のパラメータにしか無く、適用するのは管理者の端末だけ
 *   （components/ThemePreviewGate.tsx）。本番の色を変えるのは config/theme.ts の ACTIVE_THEME だけ。
 */

function supportsOklch(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("color", "oklch(0% 0 0)");
}

/**
 * 配色を、画面のクラスが直接読む変数（--t-base-50 など）にする。
 * 要素の style に付けると、その要素の中だけがその配色になる（見本の枠・<html> のどちらにも使う）。
 */
export function tuningVars(t: ThemeTuning): Record<string, string> {
  const oklch = supportsOklch();
  const vars: Record<string, string> = {};
  for (const role of THEME_ROLES) {
    const scale = roleScale(role, t[role]);
    SHADES.forEach((shade, i) => {
      vars[`--t-${role}-${shade}`] = oklch ? oklchCss(scale[i]) : oklchToHex(scale[i]);
    });
  }
  return vars;
}

export function tuningStyle(t: ThemeTuning): CSSProperties {
  return tuningVars(t) as CSSProperties;
}

/** 画面全体（<html>）に配色を付ける。null で外す（layout が出した本番のテーマに戻る） */
export function applyPreview(t: ThemeTuning | null) {
  const style = document.documentElement.style;
  if (t) {
    for (const [name, value] of Object.entries(tuningVars(t))) style.setProperty(name, value);
  } else {
    for (const role of THEME_ROLES) for (const shade of SHADES) style.removeProperty(`--t-${role}-${shade}`);
  }
}

/** ★localStorage は使えないことがある★（プライベートブラウズなど）。読めなければ「プレビューなし」として扱う */
export function readStoredPreview(): ThemeTuning | null {
  try {
    return decodeTuning(window.localStorage.getItem(THEME_PREVIEW_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** プレビューを保存する（null で消す）。保存できたかを返す。済んだら同じ画面の ThemePreviewGate に知らせる */
export function storePreview(t: ThemeTuning | null): boolean {
  let ok = true;
  try {
    if (t) window.localStorage.setItem(THEME_PREVIEW_STORAGE_KEY, encodeTuning(t));
    else window.localStorage.removeItem(THEME_PREVIEW_STORAGE_KEY);
  } catch {
    ok = false;
  }
  window.dispatchEvent(new Event(THEME_PREVIEW_EVENT));
  return ok;
}

/** WCAG の相対輝度 */
function luminance(color: Oklch): number {
  const [r, g, b] = oklchToSrgb(color).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG のコントラスト比（1〜21） */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const WHITE: Oklch = [1, 0, 0];
