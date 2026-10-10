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

/** アイコンの切り取り画面: 最小倍率（円が写真に内接する大きさ）から何倍まで拡大できるか */
export const ICON_CROP_MAX_ZOOM = 4;
/** 切り取り画面の丸い枠: 画面の端との余白 (px) と、直径の上限 (px) */
export const ICON_CROP_MARGIN_PX = 24;
export const ICON_CROP_MAX_DIAMETER_PX = 420;
/** 切り取り画面に出す写真の長辺の上限 (px)。大きな写真をそのまま動かすと重いので、表示用だけ縮める */
export const ICON_CROP_PREVIEW_EDGE = 2048;

/** guests.photoSource: アイコンの出どころ。"custom" の間は LINE のアイコンで上書きしない */
export type PhotoSource = "line" | "custom";
