/**
 * エピソードのお題。
 * ゲスト向けの投稿フォームと管理画面で同じ語彙を使うため、ここに集約する。
 * prompt は将来ゲストに出す問いかけ文。
 */
export const EPISODE_THEMES = [
  { id: "first_impression", label: "第一印象",
    className: "bg-sky-50 text-sky-700 ring-sky-200",
    prompt: "はじめて会ったとき、どんな人だと思いましたか？" },
  { id: "blunder", label: "やらかし",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
    prompt: "思わず笑ってしまった失敗談があれば教えてください" },
  { id: "rescue", label: "助けられた話",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    prompt: "助けられたこと、支えられたことはありますか？" },
  { id: "together", label: "一緒にハマったこと",
    className: "bg-violet-50 text-violet-700 ring-violet-200",
    prompt: "一緒に夢中になったこと、よく行った場所は？" },
  { id: "secret", label: "ここだけの話",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
    prompt: "本人がいないところでこっそり言いたいことは？" },
  { id: "message", label: "おふたりへ",
    className: "bg-pink-50 text-pink-700 ring-pink-200",
    prompt: "おふたりへのメッセージをどうぞ" },
  { id: "other", label: "その他",
    className: "bg-stone-100 text-stone-600 ring-stone-200",
    prompt: "そのほか、伝えたいことがあれば" },
] as const;

export type EpisodeTheme = (typeof EPISODE_THEMES)[number]["id"];

export function themeDef(id: string) {
  return EPISODE_THEMES.find((t) => t.id === id) ?? EPISODE_THEMES[6];
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
