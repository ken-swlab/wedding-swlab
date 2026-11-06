/**
 * 一覧用の小さい写真（Issue #251）。投稿のとき端末で、今の軽量版（長辺 1920px）に加えて作る。
 *   feed   … タイムライン・投稿の詳細の一覧（長辺 828px・JPEG 品質 0.72・目安 100KB）
 *   grid   … ギャラリーの格子・小さいサムネイル（長辺 400px・JPEG 品質 0.7・目安 30KB）
 *   poster … 動画の1枚目の画像（grid と同じ大きさ）。一覧では動画本体を読まずにこれを出す
 * 全画面（MediaLightbox・PostLightbox）は今の軽量版か原本を使う。
 *
 * ★キーは軽量版のキーから決める★ `u/{uid}/t/{uuid}.{ext}` → `u/{uid}/t/{uuid}__feed.jpg`。
 *   推測できない UUID のまま、置き場所は今の軽量版と同じ公開バケット。サーバー（presign・投稿の編集）も、
 *   クライアントも、ops の作り直しも、この関数だけでキーを決める（食い違うと、消す・確かめるが漏れる）。
 *   小さい版のキーは軽量版のキーの形（config/post-edit.ts の NEW_MEDIA_KEY_RE）に当たらないので、
 *   軽量版の代わり（storagePath）には使えない。
 * ★このファイルは `@/` で値を import しない★（tests/ が Node でそのまま読み込む）
 */
export const MEDIA_VARIANTS = {
  feed: { maxEdge: 828, quality: 0.72 },
  grid: { maxEdge: 400, quality: 0.7 },
  poster: { maxEdge: 400, quality: 0.7 },
} as const;

export type MediaVariant = keyof typeof MEDIA_VARIANTS;
export const MEDIA_VARIANT_NAMES = Object.keys(MEDIA_VARIANTS) as MediaVariant[];

/** 小さい版1枚の大きさの上限（presign が確かめる）。目安の数倍の余裕を見る */
export const MAX_VARIANT_BYTES = 1024 * 1024;

/** 軽量版のキー（u/{uid}/t/{uuid}.{ext}）。小さい版の元にしてよいキーの形 */
const BASE_KEY_RE = /^(u\/[^/]+\/t\/[0-9a-fA-F-]{36})\.[a-z0-9]{1,8}$/;

/** 軽量版のキーから、小さい版のキーを決める。軽量版のキーの形でなければ null */
export function variantKey(baseKey: string, variant: MediaVariant): string | null {
  const m = BASE_KEY_RE.exec(baseKey);
  return m ? `${m[1]}__${variant}.jpg` : null;
}

/** 長辺を maxEdge 以下に縮めた大きさ（元のほうが小さければそのまま） */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge || long <= 0) return { width, height };
  const r = maxEdge / long;
  return { width: Math.max(1, Math.round(width * r)), height: Math.max(1, Math.round(height * r)) };
}

/**
 * 写真の「下絵」（Issue #253）。投稿のデータ（MediaItem.placeholder）に data URL のまま入れる、長辺 16px の JPEG。
 * 写真が届く前に、ぼかして敷く（色と形がぼんやり見える）。目安 300〜600 文字。
 * ★形と長さは Firestore の Rules（okPlaceholder）と同じ★ 片方だけ変えない。
 *   投稿のデータはゲスト全員が読むので、任意の文字列を入れさせない。
 * QUALITIES の順に作り、PLACEHOLDER_MAX_CHARS 以下になったものを使う。どれも超えたら保存しない（下絵なし）。
 */
export const PLACEHOLDER = { maxEdge: 16, qualities: [0.5, 0.3, 0.15] } as const;
export const PLACEHOLDER_PREFIX = "data:image/jpeg;base64,";
export const PLACEHOLDER_MAX_CHARS = 1024;
const PLACEHOLDER_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

/** 下絵として保存してよい文字列か（Rules の okPlaceholder と同じ条件） */
export function isPlaceholder(v: unknown): v is string {
  return typeof v === "string" && v.length <= PLACEHOLDER_MAX_CHARS && PLACEHOLDER_RE.test(v);
}
