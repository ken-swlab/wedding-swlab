/**
 * 投稿の編集・削除（Issue #94）の定数。サーバー（/api/posts/[id]）とブラウザの両方から読む。
 */

/** 1投稿のメディアの上限。lib/media.ts の MAX_MEDIA_PER_POST・Rules の media.size() <= 4 と同じ値 */
export const MAX_MEDIA_PER_POST = 4;

/** 編集・削除の API のパス */
export function postApiPath(id: string): string {
  return `/api/posts/${encodeURIComponent(id)}`;
}
/** API のパスから投稿の ID を取り出す（形の検査は POST_ID_RE で別に行う） */
export const POSTS_API_PATH_RE = /^\/api\/posts\/([^/]+)\/?$/;

/**
 * 編集で足せるメディアのキー（軽量版の名前空間 u/{uid}/t/{uuid}.{ext}）。
 * 写真はブラウザで JPEG に作り直したものだけ（uploadThumb）。動画は拡張子が英数字であること。
 * 本人のキーかどうかは ownsKey() が別に確かめる。
 */
export const NEW_MEDIA_KEY_RE = {
  image: /^u\/[^/]+\/t\/[0-9a-f-]{36}\.jpe?g$/,
  video: /^u\/[^/]+\/t\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/,
} as const;
