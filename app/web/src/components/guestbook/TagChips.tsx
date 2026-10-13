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
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((t) => {
        const on = selected.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            aria-pressed={on}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
              on ? t.className : "bg-white text-stone-400 ring-stone-200 hover:bg-stone-50"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
