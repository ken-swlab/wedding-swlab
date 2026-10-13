import type { ReactNode } from "react";

/**
 * 管理画面のスマホ表示（md 未満のカード）で使う部品（Issue #127）。
 *
 * ★カードの入力欄は 16px（text-base）以上・高さ 44px 以上★
 *   iOS は 16px 未満の入力欄・セレクトにフォーカスすると画面を自動で拡大する（Issue #126）。
 */
export const CARD_INPUT =
  "min-h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-stone-400 focus:outline-none";
export const CARD_TEXTAREA =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-base leading-relaxed text-stone-800 placeholder:text-stone-300 focus:border-stone-400 focus:outline-none";
export const CARD_SELECT = "min-h-11 rounded-lg px-2 text-base font-medium";
export const CARD_BUTTON = "min-h-11 touch-manipulation rounded-full px-4 text-sm font-medium";

/** 見出し付きの入力欄 */
export function CardField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block text-[11px] text-stone-500">{label}</span>
      {children}
    </label>
  );
}

/** カードの右端の「▾」。詳細を開閉する */
export function CardToggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${label}の詳細を${open ? "閉じる" : "開く"}`}
      onClick={onClick}
      className="flex h-11 w-9 shrink-0 touch-manipulation items-center justify-center text-stone-400"
    >
      <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
    </button>
  );
}

/**
 * 「まとめて保存」を画面の下に貼り付ける（スマホだけ）。
 * ★fixed ではなく sticky★ /admin には一覧が2つ（承認待ち・本登録）あり、fixed だと2本が重なる。
 *   sticky なら、その一覧が見えている間だけ画面の下に付く。親の左右の余白（px-4）を打ち消して端まで広げる。
 */
export function MobileSaveBar({ count, onSave }: { count: number; onSave: () => void }) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-3 border-t border-stone-200 bg-white/95 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <button type="button" onClick={onSave} className={`${CARD_BUTTON} w-full bg-stone-900 text-white`}>
        まとめて保存 ({count})
      </button>
    </div>
  );
}
