export type TagDef = {
  id: string;
  label: string;
  className: string;
  selectable: boolean;
  community?: boolean;
};

export const TAG_DEFS: TagDef[] = [
  { id: "all",           label: "全員",       className: "bg-stone-100 text-stone-700 ring-stone-200",      selectable: true  },
  { id: "guest",         label: "承認済",     className: "bg-lime-50 text-lime-700 ring-lime-200",          selectable: true  },
  { id: "couple",        label: "新郎新婦",   className: "bg-pink-50 text-pink-700 ring-pink-200",          selectable: true  },
  { id: "family",        label: "親族",       className: "bg-rose-50 text-rose-700 ring-rose-200",          selectable: true,  community: true },
  { id: "friends_groom", label: "新郎友人",   className: "bg-sky-50 text-sky-700 ring-sky-200",             selectable: true,  community: true },
  { id: "friends_bride", label: "新婦友人",   className: "bg-violet-50 text-violet-700 ring-violet-200",    selectable: true,  community: true },
  { id: "colleagues",    label: "会社関係",   className: "bg-amber-50 text-amber-700 ring-amber-200",       selectable: true,  community: true },
  { id: "ceremony",      label: "挙式参列",   className: "bg-emerald-50 text-emerald-700 ring-emerald-200", selectable: true  },
  { id: "after_party",   label: "二次会",     className: "bg-teal-50 text-teal-700 ring-teal-200",          selectable: true  },
  { id: "ctf_stage1",    label: "🔓 Stage 1", className: "bg-indigo-50 text-indigo-700 ring-indigo-200",    selectable: false },
  { id: "ctf_stage2",    label: "🔓 Stage 2", className: "bg-indigo-100 text-indigo-800 ring-indigo-300",   selectable: false },
];

export const DEFAULT_GUEST_TAGS = ["all", "guest"];
export const COUPLE_TAG = "couple";

const TAG_MAP: Record<string, TagDef> = Object.fromEntries(TAG_DEFS.map((t) => [t.id, t]));

export function tagDef(id: string): TagDef {
  return TAG_MAP[id] ?? { id, label: id, className: "bg-stone-100 text-stone-600 ring-stone-200", selectable: false };
}

export const TAG_QUERY_LIMIT = 30;
