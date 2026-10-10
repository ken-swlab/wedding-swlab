/**
 * @メンション（Issue #92）の定数。
 */

/** 1つの投稿・コメントでメンションできる人数。Rules の mentionUids / mentions の上限（10）と合わせる */
export const MAX_MENTIONS = 10;

/** 候補の一覧に一度に出す人数 */
export const MENTION_SUGGEST_MAX = 8;

/** `@` のあと、この文字数までを絞り込みの語として読む（ニックネームの上限 20 より少し長く取る） */
export const MENTION_QUERY_MAX = 24;

/** 通知の一覧: 1回に読む件数。Rules の上限（notifications の items は 50）以下にする */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/** 未読の数を数える購読の上限。10 件届いたら「9+」と出す */
export const UNREAD_BADGE_LIMIT = 10;

/** 通知を作る API */
export const MENTION_NOTIFY_API = "/api/notifications/mention";

/** 通知のドキュメント ID（`mention_{コメントまたは投稿の ID}`）。同じ操作を2回呼んでも1件になる */
export function mentionNotificationId(sourceId: string): string {
  return `mention_${sourceId}`;
}

/** 投稿の詳細で、そのコメントまで送るための URL の # 以降（`#c-{コメントの ID}`） */
export const COMMENT_HASH_PREFIX = "c-";
export function commentAnchorId(commentId: string): string {
  return `${COMMENT_HASH_PREFIX}${commentId}`;
}
