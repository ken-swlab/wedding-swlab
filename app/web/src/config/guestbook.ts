/**
 * ゲストブック（/guestbook 以下）の画面構成。
 *
 * ★タイムラインとギャラリーは同じページ（/guestbook）のクエリで切り替える★
 *   posts の購読は /guestbook のページに1本だけ持たせている。
 *   ギャラリーを別ルートにすると、タブを切り替えるたびに購読を張り直す。
 */
export type GuestbookView = "timeline" | "gallery";

/** ?view= の値。無ければタイムライン */
export const GUESTBOOK_VIEW_PARAM = "view";

export const GUESTBOOK_PATHS = {
  home: "/guestbook",
  notifications: "/guestbook/notifications",
  settings: "/guestbook/settings",
} as const;

/**
 * ★承認済みゲストが留まれるパス★
 *   (guest)/layout.tsx はここに無いパスを /guestbook へ送り返す。
 *   /guestbook の下に画面を足したら、ここにも足す。
 */
export const GUESTBOOK_ALLOWED_PATHS: readonly string[] = Object.values(GUESTBOOK_PATHS);

/** ヘッダーの「＋」が飛ぶ先。タイムライン最上部の投稿欄 */
export const COMPOSER_ANCHOR_ID = "composer";
