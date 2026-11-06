/**
 * ゲストブック（/guestbook 以下）の画面構成。
 *
 * ★タイムラインとギャラリーは同じページ（/guestbook）のクエリで切り替える★
 *   posts の購読は /guestbook のページに1本だけ持たせている。
 *   ギャラリーを別ルートにすると、タブを切り替えるたびに購読を張り直す。
 */
export type GuestbookView = "timeline" | "gallery";

/**
 * ギャラリーをゲストに出すか（Issue #270）。★公開のときは false★
 *   ギャラリーの操作（全画面の × と戻るの重なり・左右の矢印・顔の照合）がまだ詰まっていないため。写真が溜まってから
 *   true にして「写真をまとめて見られるページができました」として出す。true にすれば、今の形にそのまま戻る。
 *   false の間: 下のタブからギャラリーを外し（4つ）、ギャラリーの URL（?view=gallery）はタイムラインに移す。
 *   左上のシートの説明からも外す。★管理者には今どおり出す★（中身を詰めるため。useGalleryEnabled）
 *   タイムラインの写真を押したときの全画面表示は、これとは関係なく使う。
 */
export const GALLERY_ENABLED = false;

/**
 * 招待後（/guestbook 以下・/guide 以下）のページのタイトル（Issue #226）。LINE のアプリ内ブラウザの黒いバーに出る。
 * 招待状まわり（/invitation・パスコード〜回答・承認待ち）は、ルートの layout.tsx の「WEDDING INVITATION」のまま。
 * ★ダッシュは em ダッシュ（U+2014）、前後に半角スペース★ ページごとの見出しは足さない（LINE のバーが短い）。
 * ★呼び名だけ。日付・本名は入れない★（公開リポジトリ。CLAUDE.md のルール 4a。オーナーが呼び名なら可と判断した）
 */
export const GUESTBOOK_TITLE = "UTAGE \u2014 Haru & Ken";

/** 左上のロゴ（SpaceSwitch）。GUESTBOOK_TITLE と同じ呼び名の頭文字。「&」は金で、ロゴの中で少し小さく出す */
export const GUESTBOOK_LOGO = { left: "H", amp: "&", right: "K" } as const;

/** ?view= の値。無ければタイムライン */
export const GUESTBOOK_VIEW_PARAM = "view";

export const GUESTBOOK_PATHS = {
  home: "/guestbook",
  /** コミュニティ（Issue #174）。グループごとの仲間（参加予定のメンバー）・ランキング・オープニングへの導線 */
  community: "/guestbook/community",
  notifications: "/guestbook/notifications",
  settings: "/guestbook/settings",
  /** コミュニティから開くオープニング（見返し・リアクションタイムの一発勝負。Issue #131） */
  opening: "/guestbook/opening",
  /** 以前のランキングの画面（Issue #132）。Issue #174 でコミュニティへ移し、ここはコミュニティへ送るだけ */
  reaction: "/guestbook/reaction",
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

/** マイページの自分の投稿: 1回に読む件数。Rules の上限（posts 50）以下にする */
export const MY_POSTS_PAGE_SIZE = 20;

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

/**
 * /guestbook#composer で来たら、投稿画面（ComposerSheet）を開く（Issue #224）。
 * ヘッダーの「＋」はもうこの URL へのリンクではない（ボタンでシートを開く）が、通知などの古いリンクを壊さないため残す。
 */
export const COMPOSER_ANCHOR_ID = "composer";
/** 灰色の「投稿する」を押したときに出す、足りないものの知らせを出しておく時間 (ms) */
export const COMPOSER_HINT_MS = 3000;
/** 投稿したあとの知らせ（トースト）を出しておく時間 (ms)。エピソード・新郎新婦あて・失敗の知らせ */
export const COMPOSER_TOAST_MS = 8000;
/** 写真付きの投稿の「投稿しました（軽量版）」を出しておく時間 (ms)（Issue #272） */
export const POSTED_TOAST_MS = 2500;
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

/**
 * 自分のいいねの一覧を読む件数の上限（Issue #212。MyReactionsContext）。
 * ★Rules の match /{path=**}/reactions の limit（500）と同じ値にする★ 超えると一覧の読み込みが全体で拒否される。
 * これを超えていいねしている人は、一覧に入らなかった投稿を「分からない」として扱う（白いハートで始め、押すと付けるだけ）。
 */
export const MY_REACTIONS_LIMIT = 500;

/** ハッシュタグの候補の最大件数 */
export const MAX_HASHTAG_SUGGESTIONS = 8;

/** 引っ張って更新: 指の移動量に対する表示の移動量の比、発火する距離、表示の上限 (px) */
export const PULL_RESISTANCE = 0.5;
export const PULL_TRIGGER_PX = 64;
export const PULL_MAX_PX = 96;
/** 引っ張って更新: 更新中にタイムラインを下げておく距離と、スピナーの直径 (px) */
export const PULL_HOLD_PX = 56;
export const PULL_SPINNER_PX = 28;
/** 引っ張って更新: 指を離したあと・更新が終わったあとに、タイムラインが戻る時間 (ms) */
export const PULL_SETTLE_MS = 420;
/** 引っ張って更新: 更新がすぐ終わっても、スピナーを回して見せる最短の時間 (ms) */
export const PULL_MIN_SPIN_MS = 500;

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
/** 展開の始めに、裏のタイムラインを白で覆いきるまでの時間 (ms)。SHEET_EXPAND_MS より短くする */
export const SHEET_BACKDROP_FADE_MS = 90;

/** 写真ビューアを開く・閉じる・写真を送るのにかける時間 (ms) */
export const VIEWER_OPEN_MS = 260;
export const VIEWER_CLOSE_MS = 220;
export const VIEWER_PAGE_MS = 220;

/**
 * コメント欄にフォーカスしたあと、キーボードが開いたこと（visualViewport の resize）を待つ上限 (ms)。
 * 外付けキーボードなどで画面が縮まないときは、この時間で入力欄を元の位置に戻す（CommentBar の★参照）
 */
export const KEYBOARD_OPEN_WAIT_MS = 800;

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
/**
 * 縮めたヘッダーとボトムナビを通常表示に戻させる window のイベント名（Issue #178）。
 * 承認後の演出が、下のタブ（コミュニティ）を照らす前に投げる（useCompactChrome が受ける）。
 */
export const CHROME_EXPAND_EVENT = "guestbook:chrome-expand";

/**
 * ダブルタップでいいね（Issue #96）。
 * 前のタップからこの時間以内 (ms)・この距離以内 (px) の2回目を、ダブルタップとして扱う。
 * ★1回タップの動作（写真ビューアを開く・文字情報の切り替え）は、この時間だけ待ってから行う★
 *   長くすると1回タップがもたつき、短くするとダブルタップが取りこぼされる。
 */
export const DOUBLE_TAP_MS = 280;
export const DOUBLE_TAP_SLOP_PX = 32;
/** ハートの演出の長さ (ms) と大きさ (px) */
export const HEART_BURST_MS = 900;
export const HEART_BURST_SIZE_PX = 96;
/** 「いいねできませんでした」を出しておく時間 (ms) */
export const LIKE_ERROR_MS = 2500;

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

/**
 * タイムライン・ギャラリーで読む投稿の件数（Issue #251。電波が悪くても速く開けるように）。
 * ★どれも Rules の上限（posts 50）以下にする★ 超えるとクエリ全体が拒否される。
 * - 最初は 10 件だけ購読する（以前は 50 件。写真付きが多いと、開くだけで重くなっていた）
 * - 続きは 1 回に 20 件ずつ読む（loadMore）
 * - タイムラインは、下に残りが PREFETCH 件になったら先に次を読み始める（待ち時間を見せない）
 * - ギャラリーは、最初に格子が GALLERY_FIRST_TILES 枚になるまで続けて読む
 */
export const TIMELINE_FIRST_PAGE = 10;
export const TIMELINE_NEXT_PAGE = 20;
export const TIMELINE_PREFETCH_POSTS = 3;
export const GALLERY_FIRST_TILES = 30;
/** ギャラリーの格子で、下の端の手前どれだけで先に読むか（画面の高さに対する割合） */
export const GALLERY_PREFETCH_MARGIN = "0px 0px 100% 0px";

/**
 * 写真の下絵（Issue #253）から本物の写真へ重ねるフェードの長さ。
 * ★PlaceholderImage の Tailwind のクラス（duration-200）と同じ値にする★（クラスは定数から組み立てられない）
 */
export const PLACEHOLDER_FADE_MS = 200;

/**
 * 送信中の投稿（Issue #254）を本物に入れ替える前に、本物の写真を読み込んで待つ時間の上限。
 * 過ぎたら読めていなくても入れ替える（いつまでも「送信中」のままにしない）。
 */
export const OUTBOX_PRELOAD_TIMEOUT_MS = 10_000;
