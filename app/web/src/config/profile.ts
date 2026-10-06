/** ニックネームの上限（文字数）。登録フォーム（/api/guest/register）と同じ */
export const PROFILE_NICKNAME_MAX = 20;

/** 一言ステータス（guests.bio）の上限（文字数。絵文字も1文字と数える） */
export const PROFILE_BIO_MAX = 40;

/**
 * アイコン画像。ブラウザで長辺を縮めて JPEG にしてから送る。
 * 表示は最大でもプロフィールの 96px（高精細の画面で3倍）なので、これで足りる。
 */
export const ICON_MAX_EDGE = 512;
export const ICON_QUALITY = 0.85;
export const ICON_MAX_MB = 0.3;

/** guests.photoSource: アイコンの出どころ。"custom" の間は LINE のアイコンで上書きしない */
export type PhotoSource = "line" | "custom";
