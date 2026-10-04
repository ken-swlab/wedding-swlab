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

/** 検索語のクエリ（/guestbook?q=） */
export const GUESTBOOK_QUERY_PARAM = "q";

/** 入力が止まってから検索に反映するまで (ms) */
export const SEARCH_DEBOUNCE_MS = 250;

/** ハッシュタグの候補の最大件数 */
export const MAX_HASHTAG_SUGGESTIONS = 8;

/** 引っ張って更新: 指の移動量に対する表示の移動量の比、発火する距離、表示の上限 (px) */
export const PULL_RESISTANCE = 0.5;
export const PULL_TRIGGER_PX = 64;
export const PULL_MAX_PX = 96;

/**
 * 引っ張って更新の最短間隔 (ms)。
 * ★更新は posts の購読の張り直しで、最大 50 件ぶんの読み取りになる★
 *   連打で読み取りが膨らまないよう、間隔内の更新は何もせず終える。
 */
export const PULL_REFRESH_COOLDOWN_MS = 10_000;

/** 更新の応答がこの時間来なくても、表示は終える (ms) */
export const PULL_REFRESH_TIMEOUT_MS = 8_000;
