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
  /**
   * 仕組み用のタグ（Issue #204）。権限（Custom Claims・Rules・公開範囲の判定・API）には使うが、
   * ゲストにも管理画面の選択肢・一覧にも出さない。データからは消さない。
   */
  system?: boolean;
};

export const TAG_DEFS: TagDef[] = [
  { id: "all",           label: "全員",       className: "bg-tagstone-100 text-tagstone-700 ring-tagstone-200", selectable: true  },
  // ★guest は承認済みの全員に付く仕組み用のタグ★（DEFAULT_GUEST_TAGS）。ゲストブックにいる人は全員承認済みなので、
  //   見せても意味がない。表示だけ隠し（system）、権限の判定にはこれまでどおり使う（Issue #204）
  { id: "guest",         label: "承認済",     className: "bg-lime-50 text-lime-700 ring-lime-200",          selectable: true,  system: true },
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
  // ★tagstone はテーマに従わない灰色★ タグの色はテーマ（config/theme.ts）を変えても変えない
  stone:   "bg-tagstone-100 text-tagstone-700 ring-tagstone-200",
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

/**
 * 名前がまだ分からないカスタムタグか（Issue #231）。辞書（tags の購読）が届く前と、購読に失敗したとき・消されたタグで true。
 * ★true のあいだは ID（c_xxxxxxxx）を画面に出さない★ TagBadge などは、文字のない灰色の枠を代わりに出す。
 */
export function isTagPending(id: string): boolean {
  return isCustomTagId(id) && !TAG_MAP[id] && !CUSTOM_MAP[id];
}

export const TAG_QUERY_LIMIT = 30;

/** 仕組み用のタグ（表示しない。Issue #204）か */
export function isSystemTag(id: string): boolean {
  return tagDef(id).system === true;
}

/** 表示用に、仕組み用のタグを除く（データは変えない） */
export function withoutSystemTags(ids: readonly string[]): string[] {
  return ids.filter((t) => !isSystemTag(t));
}

/**
 * 公開範囲（visibleToTags）の見せ方（Issue #204）。仕組み用のタグを除く。
 * ★仕組み用のタグだけの公開範囲（guest だけ）は「全員」と同じに見せる★ guest は承認済みの全員に付くので、
 *   見える人は all と同じ。バッジが1つも無いと公開範囲が分からないため、all に置き換えて出す。
 */
export function displayVisibleTags(ids: readonly string[]): string[] {
  const shown = withoutSystemTags(ids);
  return shown.length === 0 && ids.length > 0 ? ["all"] : shown;
}
