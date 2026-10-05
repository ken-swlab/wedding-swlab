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

const POST_PATH_RE = /^\/guestbook\/posts\/([A-Za-z0-9_-]{1,64})$/;

/** 投稿の詳細画面のパスなら投稿 ID を、そうでなければ null を返す */
export function postIdFromPath(pathname: string): string | null {
  return POST_PATH_RE.exec(pathname)?.[1] ?? null;
}

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
/** 投稿の詳細画面の下に固定したコメント入力欄。詳細の「💬」を押すとここにフォーカスする */
export const COMMENT_INPUT_ID = "comment-input";

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

/** 投稿カード ⇔ 詳細シートの展開・収縮にかける時間 (ms) */
export const SHEET_EXPAND_MS = 320;
export const SHEET_COLLAPSE_MS = 260;

/** 写真ビューアを開く・閉じる・写真を送るのにかける時間 (ms) */
export const VIEWER_OPEN_MS = 260;
export const VIEWER_CLOSE_MS = 220;
export const VIEWER_PAGE_MS = 220;

/** 展開・収縮の動きの曲線（初速が速く、最後にゆっくり止まる） */
export const MOTION_EASING = "cubic-bezier(0.2, 0, 0, 1)";

/** スクロール連動の全画面化: ナビを縮める・戻すアニメーションの時間 (ms) */
export const CHROME_MORPH_MS = 420;
/**
 * spring 風の曲線（少し行き過ぎてから戻る）。CSS の linear() で近似する。
 * linear() が使えない古い Safari（17.2 未満）では既定の ease で動く（GuestbookShell の CHROME_MOTION）。
 */
export const CHROME_MORPH_EASING =
  "linear(0, 0.13 6%, 0.45 14%, 0.79 23%, 1.02 32%, 1.1 39%, 1.09 46%, 1.03 55%, 0.99 66%, 1)";
/** 先頭からこの距離までは常に通常表示 (px)。ヘッダーの高さより少し大きく取る */
export const CHROME_TOP_ZONE_PX = 80;
/** 下へこの距離だけ続けてスクロールしたら縮める (px)。小さな揺れで縮まないための遊び */
export const CHROME_COMPACT_AFTER_PX = 24;
/** 上へこの距離スクロールしたら戻す (px)。「少しでも上へ」で戻すため小さく取る */
export const CHROME_EXPAND_AFTER_PX = 4;

/** スワイプ: 縦横どちらの操作かを決めるまでの遊び (px) */
export const SWIPE_SLOP_PX = 10;
/** スワイプで閉じる・戻る・写真を送る距離（画面の幅・高さに対する比） */
export const SWIPE_DISMISS_RATIO = 0.25;
/** これより速く指を払ったら、距離が足りなくても閉じる・送る (px/ms) */
export const SWIPE_FLICK_VELOCITY = 0.5;

/** ギャラリーで保存する写真を選ぶモード（/guestbook?view=gallery&select=1） */
export const GUESTBOOK_SELECT_PARAM = "select";

/**
 * 写真の保存を何枚・何バイトずつに分けるか。
 * ★共有シートはタップ1回につき1回しか開けない★（ブラウザの決まり）。原本は1枚最大 24MiB あり、
 *   全部を一度に読み込むとスマホのメモリが足りなくなるので、この単位で読み込んでは渡す。
 */
export const SAVE_BATCH_MAX_FILES = 10;
export const SAVE_BATCH_MAX_BYTES = 50 * 1024 * 1024;

/** 選択モードで、一番下のこの距離 (px) 手前まで来たら過去の写真を読み込み始める */
export const PICKER_PRELOAD_MARGIN_PX = 800;
