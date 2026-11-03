"use client";

import { useTagDef } from "@/lib/tags-client";

const SIZE = {
  /** ゲスト側の既定 */
  md: "px-2 py-0.5 text-[11px] font-medium",
  /** 管理画面の表（エピソード・名簿の取り込み） */
  sm: "px-1.5 py-0.5 text-[10px]",
} as const;

/**
 * タグのバッジ。★ラベルは useTagDef で引く★（Issue #231）辞書が届いたら・名前が変わったら描き直す。
 * 名前がまだ分からないカスタムタグは、ID の代わりに文字のない灰色の枠を出す（購読に失敗したときもそのまま）。
 */
export function TagBadge({ id, size = "md" }: { id: string; size?: keyof typeof SIZE }) {
  const { def, pending } = useTagDef(id);
  // 仕組み用のタグ（「承認済」）は出さない（Issue #204）
  if (def.system) return null;
  if (pending) return <TagPlaceholder size={size} />;
  return <span className={`inline-flex items-center rounded-full ring-1 ring-inset ${SIZE[size]} ${def.className}`}>{def.label}</span>;
}

/** 名前を読み込んでいるタグの枠（文字なし・幅 48px）。高さはバッジと同じになるよう、見えない文字で合わせる */
export function TagPlaceholder({ size = "md" }: { size?: keyof typeof SIZE }) {
  return (
    <span aria-hidden className={`inline-flex w-12 items-center rounded-full bg-stone-100 text-transparent ring-1 ring-inset ring-stone-200 ${SIZE[size]}`}>
      &nbsp;
    </span>
  );
}
