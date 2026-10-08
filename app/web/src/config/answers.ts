/**
 * 出欠の回答フォーム（招待状・/onboarding・/guide/questionnaire）の上限。
 * サーバー（answers-server.ts の parseAnswers）とフォームの maxLength で同じ値を使う。
 */
/** 姓・名・せい・めい それぞれの上限（文字数） */
export const ANSWER_NAME_PART_MAX = 20;
export const ANSWER_ALLERGY_MAX = 500;
export const ANSWER_NOTE_MAX = 500;

/**
 * ニックネームを空欄で送ったときの既定名の頭。後ろに uid から作った4桁を付ける（例: ゲスト0427）。
 * ★LINE の表示名を既定にしない★ guests は承認済みゲスト全員が読め、LINE 名は本名のことが多い（CLAUDE.md ルール5）。
 */
export const DEFAULT_NICKNAME_PREFIX = "ゲスト";
