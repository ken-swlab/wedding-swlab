import type { CSSProperties } from "react";

/**
 * テーマ（色の「役割」）の定義。Issue #129。
 *
 * 色は4つの役割で持つ。画面のクラスは役割の名前で書き、実際の色はここで決める。
 *   base   … 背景・文字・枠の無彩色。既存の `stone-*` のクラスがそのままこれに従う
 *   accent … ブランドの差し色（いいね・エピソードの強調など）。クラスは `accent-*`
 *   sub    … 2色目。クラスは `sub-*`
 *   pop    … 3色目（小さな強調）。クラスは `pop-*`
 *
 * ★テーマの対象外（ここを変えても変わらない色）★
 *   タグの色（config/tags.ts）、状態の色（未送信・警告 = amber、成功 = emerald、エラー・危険 = rose / red、情報 = sky）、
 *   LINE の緑。これらは意味を持つ色なので、画面のクラスに直接書いたままにする。
 *   「ブランドの差し色」を足すときは `rose-*` ではなく `accent-*` を使う。
 *
 * ★本番の色を変えるのは ACTIVE_THEME だけ★ 値は src/app/layout.tsx が <html> の style に出し、
 *   src/app/globals.css の @theme が `--color-stone-*` / `--color-accent-*` などに結び付ける。
 *
 * ★色は OKLCH と 16進（sRGB）の両方で出す★
 *   OKLCH は iPhone などの広色域の画面で Tailwind の既定色と同じ発色になる。ただし OKLCH を読めない
 *   古いブラウザ（Android の古い WebView など）では、変数ごと無効になって背景も文字も色を失う。
 *   Tailwind 自身も既定色を「16進 + 対応ブラウザだけ lab()」で出しているので、同じ二段構えにする
 *   （切り替えは globals.css の @supports）。
 */

/** 明るさの段階（Tailwind と同じ 50〜950） */
export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Shade = (typeof SHADES)[number];

export const THEME_ROLES = ["base", "accent", "sub", "pop"] as const;
export type ThemeRole = (typeof THEME_ROLES)[number];

/**
 * 役割1つぶんの色。
 *   - { hue, chroma }: 色相（0〜360）と鮮やかさから 11 段階を作る（OKLCH）
 *   - { values }: 11 段階を直接持つ（SHADES の順）。既存の色を正確に再現するときに使う
 */
export type RoleColor = { hue: number; chroma: number } | { values: readonly Oklch[] };

/** OKLCH の色: [明るさ 0〜1, 鮮やかさ, 色相 0〜360] */
export type Oklch = readonly [l: number, c: number, h: number];

export type Theme = { id: string; label: string } & Record<ThemeRole, RoleColor>;

/**
 * 段階ごとの明るさ（OKLCH の L）と、鮮やかさの配分（いちばん鮮やかな段階を 1 とした比）。
 * 明るさは、base が Tailwind の stone、色のある役割が Tailwind の rose の並び
 * （無彩色の並びをそのまま色に使うと、500〜600 が暗く濁る）。
 */
const LADDER: Record<"base" | "color", { lightness: readonly number[]; chroma: readonly number[] }> = {
  // ★base の鮮やかさは、淡い段階（50〜200 = 背景）にも残す★
  //   stone と同じ配分（50 で 0.08 倍）にすると、背景が白のままで「砂色」「生成り」にならない。
  //   THEME_CURRENT は値を直接持っているので、この配分は生成するテーマにだけ効く。
  base: {
    lightness: [0.985, 0.97, 0.923, 0.869, 0.709, 0.553, 0.444, 0.374, 0.268, 0.216, 0.147],
    chroma: [0.5, 0.6, 0.75, 0.85, 1, 1, 0.95, 0.9, 0.8, 0.7, 0.5],
  },
  color: {
    lightness: [0.969, 0.941, 0.892, 0.81, 0.712, 0.645, 0.586, 0.514, 0.455, 0.41, 0.271],
    chroma: [0.06, 0.12, 0.23, 0.46, 0.77, 0.97, 1, 0.88, 0.74, 0.63, 0.42],
  },
};

const round = (n: number, digits: number) => Number(n.toFixed(digits));

/** 役割の色を 11 段階の OKLCH（SHADES の順）にする */
export function roleScale(role: ThemeRole, color: RoleColor): Oklch[] {
  if ("values" in color) {
    if (color.values.length !== SHADES.length) throw new Error(`theme: ${role} の values は ${SHADES.length} 個で指定します`);
    return [...color.values];
  }
  const ladder = LADDER[role === "base" ? "base" : "color"];
  return SHADES.map((_, i) => [ladder.lightness[i], round(color.chroma * ladder.chroma[i], 4), round(color.hue, 2)] as const);
}

export function oklchCss([l, c, h]: Oklch): string {
  return `oklch(${round(l * 100, 1)}% ${c} ${h})`;
}

/** OKLCH → sRGB（各 0〜1。範囲の外は切り詰める）。Björn Ottosson の OKLab の式 */
export function oklchToSrgb([l, c, h]: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const gamma = (v: number) => {
    const x = Math.min(1, Math.max(0, v));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  };
  return [gamma(linear[0]), gamma(linear[1]), gamma(linear[2])];
}

export function oklchToHex(color: Oklch): string {
  return `#${oklchToSrgb(color).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * テーマを CSS 変数にする。<html> の style にそのまま渡せる。
 * 役割と段階ごとに --to-*（OKLCH）と --th-*（16進）を出す。どちらを使うかは globals.css が決める。
 */
export function themeVars(theme: Theme): CSSProperties {
  const vars: Record<string, string> = {};
  for (const role of THEME_ROLES) {
    const scale = roleScale(role, theme[role]);
    SHADES.forEach((shade, i) => {
      vars[`--to-${role}-${shade}`] = oklchCss(scale[i]);
      vars[`--th-${role}-${shade}`] = oklchToHex(scale[i]);
    });
  }
  return vars as CSSProperties;
}

/**
 * いまの見た目（テーマを入れる前と同じ色）。
 * base は Tailwind の stone、accent は Tailwind の rose の値そのもの。
 * ★値を変えない★ 「テーマを入れても見た目が変わらない」ことの基準。globals.css の :root の予備の値とも同じにしてある。
 */
export const THEME_CURRENT: Theme = {
  id: "current",
  label: "いまの配色",
  base: {
    values: [
      [0.985, 0.001, 106.423],
      [0.97, 0.001, 106.424],
      [0.923, 0.003, 48.717],
      [0.869, 0.005, 56.366],
      [0.709, 0.01, 56.259],
      [0.553, 0.013, 58.071],
      [0.444, 0.011, 73.639],
      [0.374, 0.01, 67.558],
      [0.268, 0.007, 34.298],
      [0.216, 0.006, 56.043],
      [0.147, 0.004, 49.25],
    ],
  },
  accent: {
    values: [
      [0.969, 0.015, 12.422],
      [0.941, 0.03, 12.58],
      [0.892, 0.058, 10.001],
      [0.81, 0.117, 11.638],
      [0.712, 0.194, 13.428],
      [0.645, 0.246, 16.439],
      [0.586, 0.253, 17.585],
      [0.514, 0.222, 16.935],
      [0.455, 0.188, 13.697],
      [0.41, 0.159, 10.272],
      [0.271, 0.105, 12.094],
    ],
  },
  // sub と pop は、まだ画面で使っていない（使い始めるのはテーマを決めたあと）
  sub: { hue: 135, chroma: 0.13 },
  pop: { hue: 80, chroma: 0.17 },
};

/** 色相と鮮やかさだけで決まるテーマ（デザイン検討ページのスライダーが動かす値。Issue #130） */
export type ThemeTuning = Record<ThemeRole, { hue: number; chroma: number }>;
export type TunedTheme = { id: string; label: string; note: string } & ThemeTuning;

/** スライダーの上限。base は低くする（背景と文字が読めなくならないように） */
export const CHROMA_MAX: Record<ThemeRole, number> = { base: 0.05, accent: 0.3, sub: 0.3, pop: 0.3 };
export const CHROMA_STEP = 0.005;

/**
 * デザインの候補（/admin/design で切り替える）。値は出発点で、スライダーで調整してから決める。
 * 「フリー」は今の配色に近い値から始める。
 */
export const THEME_CANDIDATES: readonly TunedTheme[] = [
  {
    id: "spain",
    label: "スペイン",
    note: "砂色・生成りに、テラコッタとオリーブ、シェリーの琥珀色",
    base: { hue: 75, chroma: 0.035 },
    accent: { hue: 40, chroma: 0.15 },
    sub: { hue: 115, chroma: 0.09 },
    pop: { hue: 70, chroma: 0.15 },
  },
  {
    id: "flower",
    label: "花",
    note: "ごく淡い白に、ピンク・黄緑・黄の可愛らしい色",
    base: { hue: 20, chroma: 0.005 },
    accent: { hue: 355, chroma: 0.17 },
    sub: { hue: 125, chroma: 0.16 },
    pop: { hue: 95, chroma: 0.17 },
  },
  {
    id: "natural",
    label: "ナチュラル",
    note: "温かいベージュに、茶と緑、苔色",
    base: { hue: 70, chroma: 0.03 },
    accent: { hue: 55, chroma: 0.09 },
    sub: { hue: 145, chroma: 0.11 },
    pop: { hue: 120, chroma: 0.08 },
  },
  {
    id: "free",
    label: "フリー",
    note: "スライダーで自由に決める（今の配色に近い値から）",
    base: { hue: 60, chroma: 0.01 },
    accent: { hue: 16, chroma: 0.25 },
    sub: { hue: 135, chroma: 0.13 },
    pop: { hue: 80, chroma: 0.17 },
  },
];

/** プレビューの保存先（端末の localStorage）と、共有リンクのパラメータ名 */
export const THEME_PREVIEW_STORAGE_KEY = "wedding:theme-preview";
export const THEME_PREVIEW_PARAM = "theme";
/** プレビューを始めた・解除したことを、同じ画面の中で知らせるイベント名 */
export const THEME_PREVIEW_EVENT = "wedding:theme-preview-change";

const ROLE_CODE: Record<ThemeRole, string> = { base: "b", accent: "a", sub: "s", pop: "p" };

/** 配色を短い文字列にする（URL と localStorage 用）。例: b75-0.035_a40-0.15_s115-0.09_p70-0.15 */
export function encodeTuning(t: ThemeTuning): string {
  return THEME_ROLES.map((r) => `${ROLE_CODE[r]}${round(t[r].hue, 1)}-${round(t[r].chroma, 3)}`).join("_");
}

/**
 * encodeTuning の逆。形が違えば null。
 * ★数値だけを受け付け、範囲に切り詰める★ URL から来た値を CSS 変数に入れるので、数値以外は通さない。
 */
export function decodeTuning(raw: string | null | undefined): ThemeTuning | null {
  if (!raw || raw.length > 80) return null;
  const parts = raw.split("_");
  if (parts.length !== THEME_ROLES.length) return null;
  const out = {} as ThemeTuning;
  for (let i = 0; i < THEME_ROLES.length; i++) {
    const role = THEME_ROLES[i];
    const m = /^([a-z])(\d{1,3}(?:\.\d)?)-(0(?:\.\d{1,3})?)$/.exec(parts[i]);
    if (!m || m[1] !== ROLE_CODE[role]) return null;
    const hue = Number(m[2]);
    const chroma = Number(m[3]);
    if (!(hue >= 0 && hue <= 360)) return null;
    out[role] = { hue, chroma: Math.min(chroma, CHROMA_MAX[role]) };
  }
  return out;
}

/** config/theme.ts に貼る形（ACTIVE_THEME の行を置き換える） */
export function exportTheme(id: string, label: string, t: ThemeTuning): string {
  const line = (r: ThemeRole) => `  ${r}: { hue: ${round(t[r].hue, 1)}, chroma: ${round(t[r].chroma, 3)} },`;
  return [`export const ACTIVE_THEME: Theme = {`, `  id: ${JSON.stringify(id)},`, `  label: ${JSON.stringify(label)},`, ...THEME_ROLES.map(line), `};`].join("\n");
}

/** 選べるテーマ。足すときはここに並べる */
export const THEME_PRESETS: readonly Theme[] = [THEME_CURRENT];

/** ★本番で使うテーマ★ ここを差し替えて push すると、全画面の stone / accent / sub / pop の色が変わる */
export const ACTIVE_THEME: Theme = THEME_CURRENT;
