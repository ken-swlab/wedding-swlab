"use client";

import type { TagDef } from "@/config/tags";

/**
 * タグを選ぶチップの並び。投稿の公開範囲の選択（Composer）と、ランキングのグループの切り替え（Issue #132）で使う。
 *
 * ★この2か所の見た目と操作をそろえるための共通の部品★
 *   ランキングでタグを切り替えることに慣れてもらい、投稿の公開範囲の選択を同じ操作でできるようにする。
 *   片方だけ見た目を変えない。
 * 選んだときに何が起きるか（複数選べるか・1つだけか）は、呼び出し側が onSelect で決める。
 */
export function TagChips({
  options,
  selected,
  onSelect,
  label,
}: {
  options: readonly TagDef[];
  selected: readonly string[];
  onSelect: (id: string) => void;
  /** 読み上げ用の名前（「公開範囲」「グループ」） */
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-x-1.5 gap-y-2">
      {options.map((t) => {
        const on = selected.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            aria-pressed={on}
            // 見た目は高さ 24px のまま、押せる範囲だけ上下に 10px ずつ広げる（Issue #230。押せる部品は 44px 以上）
            className={`relative touch-manipulation rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-[''] ${
              // ★無彩色★（Issue #236。タグの色分けは管理画面だけ）。選んでいるものは墨の枠と文字
              on ? "font-semibold text-stone-900 ring-stone-900" : "text-stone-400 ring-tagline hover:bg-stone-100"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
