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
/** TAG_DEFS の中での位置（並び順が保存されていない組み込みのタグの並びに使う） */
const BUILTIN_INDEX: Record<string, number> = Object.fromEntries(TAG_DEFS.map((t, i) => [t.id, i]));

export function isBuiltinTagId(id: string): boolean {
  return id in TAG_MAP;
}

/**
 * ★隠せない組み込みのタグ★（Issue #248）アプリの動きに使っている。
 *   all（全員）・guest（承認済み。承認の判定）・couple（新郎新婦あての投稿）・family（親族用の招待状・承認のとき自動で付く）。
 *   タグの管理は隠すボタンを出さず、API（/api/admin/tags の PATCH）も archived: true を断る。
 */
export const LOCKED_TAG_IDS: ReadonlySet<string> = new Set(["all", "guest", "couple", "family"]);

/** 隠せる（アーカイブできる）タグか。作ったタグと、隠せない組み込み以外の組み込みのタグ */
export function canHideTag(id: string): boolean {
  return isCustomTagId(id) || (isBuiltinTagId(id) && !LOCKED_TAG_IDS.has(id));
}

/** 名前・色・コミュニティを変えられるか。仕組み用の guest だけは変えない（表示しないタグ） */
export function canEditTag(id: string): boolean {
  return isCustomTagId(id) || (isBuiltinTagId(id) && id !== "guest");
}

/**
 * Firestore の tags/{id} の中身（Issue #221・#248）。
 *   作ったタグ（c_xxxxxxxx）: タグそのもの。
 *   組み込みのタグ（TAG_DEFS の ID）: 上書き用。書いてある項目だけ TAG_DEFS の値に重ねる。無ければ TAG_DEFS のまま。
 */
export type TagDocData = {
  label?: string;
  palette?: string;
  selectable?: boolean;
  community?: boolean;
  archived?: boolean;
  order?: number;
};

/** 実行時に Firestore から読み込んだカスタムタグ */
let CUSTOM_MAP: Record<string, TagDef> = {};
/** 実行時に Firestore の上書きを重ねた組み込みのタグ（上書きの無いタグは入れない） */
let BUILTIN_OVERRIDE_MAP: Record<string, TagDef> = {};

export function registerCustomTags(defs: TagDef[]) {
  CUSTOM_MAP = Object.fromEntries(defs.filter((t) => !isBuiltinTagId(t.id)).map((t) => [t.id, { ...t, custom: true }]));
}

/** 組み込みのタグに上書きを重ねる。★隠せないタグの archived と、guest の名前・色は無視する★ */
function mergeBuiltin(base: TagDef, d: TagDocData): TagDef {
  const editable = canEditTag(base.id);
  return {
    ...base,
    label: editable && typeof d.label === "string" && d.label ? d.label : base.label,
    className: editable && typeof d.palette === "string" ? paletteClass(d.palette) : base.className,
    community: editable && typeof d.community === "boolean" ? d.community : base.community,
    archived: canHideTag(base.id) && d.archived === true,
    order: typeof d.order === "number" ? d.order : undefined,
  };
}

/** 作ったタグのドキュメントを TagDef にする */
export function customTagFromDoc(id: string, d: TagDocData): TagDef {
  return {
    id,
    label: d.label || id,
    className: paletteClass(d.palette ?? "stone"),
    selectable: d.selectable !== false,
    community: d.community === true,
    archived: d.archived === true,
    order: typeof d.order === "number" ? d.order : 0,
    custom: true,
  };
}

/**
 * tags コレクションの中身をまとめて辞書に入れる（クライアントの購読・サーバーの読み込みの両方。Issue #248）。
 * 組み込みの ID は上書きとして重ね、それ以外は作ったタグとして入れる。
 */
export function applyTagDocs(docs: readonly { id: string; data: TagDocData }[]) {
  const custom: TagDef[] = [];
  const overrides: Record<string, TagDef> = {};
  for (const { id, data } of docs) {
    if (isBuiltinTagId(id)) overrides[id] = mergeBuiltin(TAG_MAP[id], data);
    else custom.push(customTagFromDoc(id, data));
  }
  BUILTIN_OVERRIDE_MAP = overrides;
  registerCustomTags(custom);
}

/** 作成・編集の直後、購読が届く前でもラベルを出すための楽観更新（組み込みの ID なら上書きを更新する） */
export function upsertCustomTag(def: TagDef) {
  if (isBuiltinTagId(def.id)) {
    BUILTIN_OVERRIDE_MAP = { ...BUILTIN_OVERRIDE_MAP, [def.id]: { ...def, custom: undefined } };
    return;
  }
  CUSTOM_MAP = { ...CUSTOM_MAP, [def.id]: { ...def, custom: true } };
}

export function customTagDefs(): TagDef[] {
  return Object.values(CUSTOM_MAP).sort(compareTagOrder);
}

/** 上書きを重ねた組み込みのタグ（TAG_DEFS の順。隠したタグも含む） */
export function builtinTagDefs(): TagDef[] {
  return TAG_DEFS.map((t) => BUILTIN_OVERRIDE_MAP[t.id] ?? t);
}

/**
 * タグの並び順（Issue #248）。★この順が、承認後の写真の優先順も兼ねる★（上ほど優先）
 *   並び順（order）を保存したタグはその順。保存していない組み込みのタグは作ったタグより上（TAG_DEFS の順）で、
 *   一度並べ替えると、すべてのタグに order が入る（タグの管理が 0 から振り直す）。
 */
function orderKey(t: TagDef): number {
  if (isBuiltinTagId(t.id)) return t.order ?? BUILTIN_INDEX[t.id] - 1000;
  return t.order ?? 0;
}
export function compareTagOrder(a: TagDef, b: TagDef): number {
  return (
    orderKey(a) - orderKey(b) ||
    (BUILTIN_INDEX[a.id] ?? 1e6) - (BUILTIN_INDEX[b.id] ?? 1e6) ||
    a.label.localeCompare(b.label, "ja")
  );
}

/** 組み込み ∪ カスタムを並び順に。includeArchived が false なら隠した・アーカイブしたタグを除く */
export function orderedTagDefs(includeArchived = false): TagDef[] {
  return [...builtinTagDefs(), ...Object.values(CUSTOM_MAP)].filter((t) => includeArchived || !t.archived).sort(compareTagOrder);
}

/** 組み込み ∪ カスタム（隠した・アーカイブしたものは除く。並び順）＝ピッカーに出す一覧 */
export function allTagDefs(): TagDef[] {
  return orderedTagDefs(false);
}

/** タグ ID の並び順（隠したタグも含む）。承認後の写真の優先順（lib/welcome-config.ts の pickWelcome）に渡す */
export function tagOrderIds(): string[] {
  return orderedTagDefs(true).map((t) => t.id);
}

/** 組み込みのタグも含めて、並び順が一度でも保存されたか（承認後の写真の優先順を写したかの目安。Issue #248） */
export function isTagOrderSaved(): boolean {
  return Object.values(BUILTIN_OVERRIDE_MAP).some((t) => typeof t.order === "number");
}

/** 未知の ID でも必ず何かを返す。辞書の取得に失敗しても表示は壊れない */
export function tagDef(id: string): TagDef {
  return (
    BUILTIN_OVERRIDE_MAP[id] ??
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
