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
 * 投稿 ID として受け付ける形。Firestore の自動 ID は英数字 20 文字。
 * ★URL の値をそのまま doc() に渡さない★ "/" などが混ざると別のパスを指してしまう。
 */
export const POST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** 投稿の詳細画面（コメント欄つき） */
export function postPath(id: string): string {
  return `${GUESTBOOK_PATHS.home}/posts/${encodeURIComponent(id)}`;
}

const POST_PATH_RE = /^\/guestbook\/posts\/[A-Za-z0-9_-]{1,64}$/;

/**
 * ★承認済みゲストが留まれるパス★
 *   (guest)/layout.tsx はここで false になるパスを /guestbook へ送り返す。
 *   /guestbook の下に画面を足したら、ここにも足す。
 */
export function isGuestbookPath(pathname: string): boolean {
  return (
    (Object.values(GUESTBOOK_PATHS) as string[]).includes(pathname) ||
    POST_PATH_RE.test(pathname)
  );
}

/** ヘッダーの「＋」が飛ぶ先。タイムライン最上部の投稿欄 */
export const COMPOSER_ANCHOR_ID = "composer";

/** 戻る操作で復元するスクロール位置の保存先（sessionStorage）。ビューごとに分ける */
export const SCROLL_STORAGE_PREFIX = "guestbook-scroll:";

/** popstate からこの時間内に描かれた画面を「戻る操作で来た」とみなす (ms) */
export const POP_RESTORE_WINDOW_MS = 1500;
