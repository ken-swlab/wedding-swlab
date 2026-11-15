"use client";

import { CheckIcon } from "@/components/icons";
import { COUPLE_TAG, displayVisibleTags, isTagPending, tagDef, type TagDef } from "@/config/tags";
import { ALL_TAG, scopeForDisplay } from "@/lib/visibility-scope";
import { useId } from "react";

/**
 * 公開範囲を選ぶ1行（Issue #299）。投稿画面（Composer）と投稿の編集（PostEditor。Issue #300）で使う。
 *
 * ★チップにせず「文字とチェック」★（product-decisions.md「意味が違うものは形も変える」）お題はチップ、公開範囲は文字とチェック。
 *   選んでいるものは墨の太字とチェック、選んでいないものは補足の色。タグが多いときは折り返す。
 * ★シートに隠さず、投稿画面にそのまま出す★ 範囲を見ないまま投稿しないように（以前は1行にたたみ、押すとシートが開いた）。
 * 並びは、個別のタグ（タグの管理の並び順）→ 全員 → 新郎新婦。選び方（全員と個別の切り替え・新郎新婦は単独）は
 *   呼び出し側が onSelect（lib/visibility-scope.ts の toggleScope）で決める。
 */
export function ScopePicker({
  options,
  selected,
  onSelect,
  disabled = false,
}: {
  /** 選べるタグ（タグの管理の並び順） */
  options: readonly TagDef[];
  selected: readonly string[];
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  const ordered = [
    ...options.filter((t) => t.id !== ALL_TAG && t.id !== COUPLE_TAG),
    ...options.filter((t) => t.id === ALL_TAG),
    ...options.filter((t) => t.id === COUPLE_TAG),
  ];
  return (
    <div>
      {/* 入力のラベルはゴシック（Issue #227）。強弱は太さで付ける */}
      <p id={labelId} className="text-xs font-semibold text-stone-500">公開範囲</p>
      <div role="group" aria-labelledby={labelId} className="-ml-1 flex flex-wrap gap-x-2">
        {ordered.map((t) => {
          const on = selected.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-pressed={on}
              disabled={disabled}
              className={`inline-flex min-h-[var(--inv-tap)] touch-manipulation items-center gap-1 px-1 text-sm transition disabled:opacity-40 ${
                on ? "font-semibold text-stone-900" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {/* チェックの場所は空けておく（選び直しても文字の位置がずれない） */}
              <CheckIcon className={`h-4 w-4 ${on ? "" : "opacity-0"}`} />
              {t.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-stone-500">{scopeNote(selected)}</p>
    </div>
  );
}

/** 「◯◯ に表示されます」（新郎新婦だけのときは「あなたと新郎新婦だけに表示されます」） */
export function scopeNote(selected: readonly string[]): string {
  if (selected.length === 1 && selected[0] === COUPLE_TAG) return "あなたと新郎新婦だけに表示されます";
  return selected.length > 0 ? `${scopeNames(selected)} に表示されます` : "1つ以上選んでください";
}

/**
 * 公開範囲の名前（「全員・新郎友人」）。★名前がまだ分からないカスタムタグは ID を出さず「…」にする★（Issue #231）
 *   呼び出し側が useTags を呼んでいれば、辞書が届いたら描き直されて名前になる。
 */
export function scopeNames(selected: readonly string[]): string {
  return scopeForDisplay(displayVisibleTags(selected)).map((t) => (isTagPending(t) ? "…" : tagDef(t).label)).join("・");
}
