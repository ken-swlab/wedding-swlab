/**
 * 投稿画面のお題（Issue #284）。お題を選ぶ＝思い出エピソードとして保存する（チェックボックスは廃止）。
 *
 * ★並び順と文言は Issue #284 で確定★ 変えるときはオーナーに確認する。
 * ★ハッシュタグ名に記号を使わない★（「・」などは lib/text.ts の TOKEN_RE で途中で切れる）。
 * ★旧お題（LEGACY）は消さない★ 保存済みの投稿・エピソードの表示と絞り込みに使う（チップとしては出さない）。
 *   旧お題のハッシュタグは「#お題名」だった（「その他」は付けていなかった）。
 * ★このファイルは `@/` で値を import しない★（tests/ が Node でそのまま読み込む）
 */
export type EpisodePrompt = {
  id: string;
  /** チップの文字 */
  label: string;
  /** 投稿するときに本文の末尾へ足すハッシュタグ（# を含む）。無ければ足さない */
  hashtag: string | null;
  /** お題を選んだときの入力欄のプレースホルダー */
  placeholder: string;
};

/** チップとして出すお題（この順に並べる） */
export const EPISODE_PROMPTS: readonly EpisodePrompt[] = [
  { id: "laugh", label: "笑った話", hashtag: "#笑った話", placeholder: "研修、飲み会、部活、なにげない瞬間……思い出すとクスッとする、お腹を抱えて笑った出来事は？" },
  { id: "trip", label: "旅・おでかけ", hashtag: "#旅とおでかけ", placeholder: "卒業旅行、遠征先の寄り道、週末のおでかけ……みんなで出かけた日の思い出は？" },
  { id: "food", label: "ごはん・飲み会", hashtag: "#ごはんと飲み会", placeholder: "練習後のラーメン、終電を逃した夜、いつものお店……忘れられないごはんや飲み会は？" },
  { id: "side", label: "意外な一面", hashtag: "#意外な一面", placeholder: "職場や部活では見せない顔、ふとした優しさ……「そんな一面が！」と思った出来事は？" },
  { id: "moved", label: "グッときた話", hashtag: "#グッときた話", placeholder: "卒業、お祝い、別れの日、最後の試合……今でも心に残っている瞬間は？" },
  { id: "swim", label: "水泳", hashtag: "#水泳の思い出", placeholder: "合宿、試合、練習、ベストが出た日……水泳での忘れられない思い出は？" },
  { id: "photo", label: "秘蔵写真", hashtag: "#秘蔵写真", placeholder: "懐かしい1枚、みんなで撮った1枚……とっておきの写真と、そのときの話を教えてください" },
];

/** 以前のお題（表示と絞り込みのためだけに残す。チップには出さない） */
export const LEGACY_EPISODE_PROMPTS: readonly EpisodePrompt[] = [
  { id: "first_impression", label: "第一印象", hashtag: "#第一印象", placeholder: "はじめて会ったとき、どんな人だと思いましたか？" },
  { id: "blunder", label: "やらかし", hashtag: "#やらかし", placeholder: "思わず笑ってしまった失敗談があれば教えてください" },
  { id: "rescue", label: "助けられた話", hashtag: "#助けられた話", placeholder: "助けられたこと、支えられたことはありますか？" },
  { id: "together", label: "一緒にハマったこと", hashtag: "#一緒にハマったこと", placeholder: "一緒に夢中になったこと、よく行った場所は？" },
  { id: "secret", label: "ここだけの話", hashtag: "#ここだけの話", placeholder: "本人がいないところでこっそり言いたいことは？" },
  { id: "message", label: "おふたりへ", hashtag: "#おふたりへ", placeholder: "おふたりへのメッセージをどうぞ" },
  { id: "other", label: "その他", hashtag: null, placeholder: "そのほか、伝えたいことがあれば" },
];

const ALL = [...EPISODE_PROMPTS, ...LEGACY_EPISODE_PROMPTS];

/** 新しく投稿できるお題か（API の検証。旧お題では新しく投稿させない） */
export function isCurrentPromptId(id: string): boolean {
  return EPISODE_PROMPTS.some((p) => p.id === id);
}

/** お題の定義（新旧どちらも。知らない id は null） */
export function promptDef(id: string): EpisodePrompt | null {
  return ALL.find((p) => p.id === id) ?? null;
}

/**
 * お題のハッシュタグを本文の末尾に足す（今までの方式のまま。投稿するときに1回だけ）。
 * ★すでに同じタグが書かれていれば足さない★（全角の ＃・空白の違いは NFKC と空白の除去で吸収する）。
 * お題を選んでいない・ハッシュタグの無いお題なら、本文をそのまま返す。お題を切り替えても、足すのは投稿するときの
 * お題の分だけなので、重ならない。
 */
export function withPromptHashtag(raw: string, promptId: string): string {
  const tag = promptId ? promptDef(promptId)?.hashtag : null;
  if (!tag) return raw;
  const flat = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
  if (flat(raw).includes(flat(tag))) return raw;
  const body = raw.trimEnd();
  return body ? `${body}\n\n${tag}` : tag;
}

/** お題を選んでいないときのプレースホルダー。式の前日までと、開催日以降で変える（Issue #284 の 5） */
export const PLACEHOLDER_BEFORE_EVENT = "おふたりへのメッセージや、思い出をどうぞ";
export const PLACEHOLDER_AFTER_EVENT = "おふたりへのメッセージや、当日の写真をどうぞ 🌿";

/** お題を選んでいるときだけ、入力欄の下に出す注意書き */
export const EPISODE_NOTE =
  "おふたりが確認したうえで、当日のムービーやおもてなしAIで紹介することがあります（公開範囲内の方の話としてのみ使います）。";

/**
 * 「いま ◯件の思い出が集まっています」（Issue #284 の 2）。★あとで消す予定なので、ここで止められる★
 * 件数はサーバー（/api/episodes/count）が全体を数え、EPISODE_COUNT_MIN 未満なら返さない（画面は出さない）。
 */
export const EPISODE_COUNT_ENABLED = true;
export const EPISODE_COUNT_MIN = 20;
/** サーバーで件数を覚えておく時間 (ms) */
export const EPISODE_COUNT_CACHE_MS = 60_000;
