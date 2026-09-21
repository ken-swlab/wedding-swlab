export type TagDef = {
  id: string;
  label: string;
  className: string;
  selectable: boolean;
  community?: boolean;
  /** 管理画面から作られたカスタムタグか */
  custom?: boolean;
  /** 論理削除。ピッカーには出ないが、既存データの表示は壊れない */
  archived?: boolean;
  order?: number;
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

/**
 * ★Tailwind のクラス文字列は Firestore に保存できない★
 *   JIT はビルド時にソースを走査してクラスを生成するため、
 *   DB に入れた "bg-pink-50" は CSS バンドルに存在せず、色が付かない。
 *   そこで Firestore には「パレットキー」だけを持ち、
 *   実際のクラス文字列はこのソース上の固定表から引く。
 */
export const TAG_PALETTES = {
  stone:   "bg-stone-100 text-stone-700 ring-stone-200",
  rose:    "bg-rose-50 text-rose-700 ring-rose-200",
  pink:    "bg-pink-50 text-pink-700 ring-pink-200",
  orange:  "bg-orange-50 text-orange-700 ring-orange-200",
  amber:   "bg-amber-50 text-amber-700 ring-amber-200",
  lime:    "bg-lime-50 text-lime-700 ring-lime-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  teal:    "bg-teal-50 text-teal-700 ring-teal-200",
  cyan:    "bg-cyan-50 text-cyan-700 ring-cyan-200",
  sky:     "bg-sky-50 text-sky-700 ring-sky-200",
  indigo:  "bg-indigo-50 text-indigo-700 ring-indigo-200",
  violet:  "bg-violet-50 text-violet-700 ring-violet-200",
  fuchsia: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
} as const;

export type PaletteKey = keyof typeof TAG_PALETTES;
export const PALETTE_KEYS = Object.keys(TAG_PALETTES) as PaletteKey[];
export function paletteClass(key: string): string {
  return TAG_PALETTES[key as PaletteKey] ?? TAG_PALETTES.stone;
}

/**
 * カスタムタグの ID は不透明な乱数にする。
 * ラベルからスラグを作る方式は「大学同期」のような日本語を安定して
 * 扱えないうえ、タグ ID は Custom Claims に焼き込まれる権限キーなので、
 * 衝突が「別の意味のタグが同じ権限になる」という ABAC のバグに直結する。
 */
export const CUSTOM_TAG_ID_RE = /^c_[0-9a-f]{8}$/;
export function isCustomTagId(id: string): boolean {
  return CUSTOM_TAG_ID_RE.test(id);
}

/** 1ゲストあたりの上限。array-contains-any は30件までで、
 *  超えるとエピソードの RAG 取得が静かに欠落する */
export const MAX_TAGS_PER_GUEST = 20;
export const MAX_TAG_LABEL = 16;

const TAG_MAP: Record<string, TagDef> = Object.fromEntries(TAG_DEFS.map((t) => [t.id, t]));

/** 実行時に Firestore から読み込んだカスタムタグ */
let CUSTOM_MAP: Record<string, TagDef> = {};

export function registerCustomTags(defs: TagDef[]) {
  CUSTOM_MAP = Object.fromEntries(defs.map((t) => [t.id, { ...t, custom: true }]));
}

/** 作成直後、購読が届く前でもラベルを出すための楽観更新 */
export function upsertCustomTag(def: TagDef) {
  CUSTOM_MAP = { ...CUSTOM_MAP, [def.id]: { ...def, custom: true } };
}

export function customTagDefs(): TagDef[] {
  return Object.values(CUSTOM_MAP).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label, "ja"),
  );
}

/** 組み込み ∪ カスタム（archived は除く）＝ピッカーに出す一覧 */
export function allTagDefs(): TagDef[] {
  return [...TAG_DEFS, ...customTagDefs().filter((t) => !t.archived)];
}

/** 未知の ID でも必ず何かを返す。辞書の取得に失敗しても表示は壊れない */
export function tagDef(id: string): TagDef {
  return (
    TAG_MAP[id] ??
    CUSTOM_MAP[id] ?? { id, label: id, className: TAG_PALETTES.stone, selectable: false }
  );
}

export const TAG_QUERY_LIMIT = 30;
