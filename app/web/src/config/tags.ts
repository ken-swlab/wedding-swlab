/**
 * タグ辞書（ABAC の語彙）。
 * ここの id は Custom Claims に入れる文字列と 1:1 で一致させること。
 * 付与は Admin SDK (setCustomUserClaims) 側でのみ行う。
 */
export type TagDef = {
  id: string;
  label: string;
  /** バッジの Tailwind クラス */
  className: string;
  /** 投稿時の公開範囲セレクタに出すか（CTF報酬タグは false） */
  selectable: boolean;
};

export const TAG_DEFS: TagDef[] = [
  { id: "all",           label: "全員",       className: "bg-stone-100 text-stone-700 ring-stone-200",     selectable: true  },
  { id: "family",        label: "親族",       className: "bg-rose-50 text-rose-700 ring-rose-200",         selectable: true  },
  { id: "friends_groom", label: "新郎友人",   className: "bg-sky-50 text-sky-700 ring-sky-200",            selectable: true  },
  { id: "friends_bride", label: "新婦友人",   className: "bg-violet-50 text-violet-700 ring-violet-200",   selectable: true  },
  { id: "colleagues",    label: "会社関係",   className: "bg-amber-50 text-amber-700 ring-amber-200",      selectable: true  },
  { id: "ceremony",      label: "挙式参列",   className: "bg-emerald-50 text-emerald-700 ring-emerald-200", selectable: true  },
  { id: "after_party",   label: "二次会",     className: "bg-teal-50 text-teal-700 ring-teal-200",         selectable: true  },
  { id: "ctf_stage1",    label: "🔓 Stage 1", className: "bg-indigo-50 text-indigo-700 ring-indigo-200",   selectable: false },
  { id: "ctf_stage2",    label: "🔓 Stage 2", className: "bg-indigo-100 text-indigo-800 ring-indigo-300",  selectable: false },
];

const TAG_MAP: Record<string, TagDef> = Object.fromEntries(
  TAG_DEFS.map((t) => [t.id, t]),
);

export function tagDef(id: string): TagDef {
  return TAG_MAP[id] ?? {
    id, label: id, className: "bg-stone-100 text-stone-600 ring-stone-200", selectable: false,
  };
}

/** Firestore の array-contains-any は最大30要素 */
export const TAG_QUERY_LIMIT = 30;
