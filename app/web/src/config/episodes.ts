import { EPISODE_PROMPTS, LEGACY_EPISODE_PROMPTS } from "./episode-prompts.ts";

/**
 * エピソードのお題（管理画面・AI の表示に使う）。定義の本体は config/episode-prompts.ts（Issue #284）。
 * ★新しいお題を先に、旧お題をあとに並べる★ 旧お題は保存済みのエピソードの表示のために残す（新しくは投稿できない）。
 * className は管理画面のバッジの色（ゲストの画面では使わない）。新しいお題は無彩色、旧お題は今までの色。
 */
const LEGACY_CLASS: Record<string, string> = {
  first_impression: "bg-sky-50 text-sky-700 ring-sky-200",
  blunder: "bg-amber-50 text-amber-700 ring-amber-200",
  rescue: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  together: "bg-violet-50 text-violet-700 ring-violet-200",
  secret: "bg-rose-50 text-rose-700 ring-rose-200",
  message: "bg-pink-50 text-pink-700 ring-pink-200",
  other: "bg-tagstone-100 text-tagstone-600 ring-tagstone-200",
};
const NEW_CLASS = "bg-tagstone-100 text-tagstone-700 ring-tagstone-200";

export const EPISODE_THEMES: readonly { id: string; label: string; className: string; prompt: string }[] = [
  ...EPISODE_PROMPTS.map((p) => ({ id: p.id, label: p.label, className: NEW_CLASS, prompt: p.placeholder })),
  ...LEGACY_EPISODE_PROMPTS.map((p) => ({ id: p.id, label: p.label, className: LEGACY_CLASS[p.id] ?? NEW_CLASS, prompt: p.placeholder })),
];

export type EpisodeTheme = string;

/** お題の定義（知らない id は「その他」） */
export function themeDef(id: string) {
  return EPISODE_THEMES.find((t) => t.id === id) ?? EPISODE_THEMES.find((t) => t.id === "other")!;
}

/** 「時期」の入力補助。自由記述も許す */
export const EPISODE_PERIODS = [
  "幼少期", "小学生", "中学生", "高校生", "大学生",
  "社会人になってから", "ここ数年", "最近", "時期不明",
] as const;

export const EPISODE_STATUS_LABEL: Record<string, string> = {
  pending: "未承認",
  approved: "承認済",
  rejected: "非表示",
};

export const MAX_EPISODE_CONTENT = 4000;
export const MAX_EPISODE_TITLE = 80;
export const MAX_EPISODE_PERIOD = 40;
export const MAX_EPISODE_TARGETS = 30;
