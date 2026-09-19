/**
 * プロジェクター投影の設定。
 *
 * ★SCREEN_TAGS は既定で ["all"] のみ★
 *   親族限定などの投稿が巨大スクリーンに出る事故を防ぐため、
 *   明示的に「全員公開」のものだけを投影対象にしている。
 *   変更したい場合は NEXT_PUBLIC_SCREEN_TAGS="all,ceremony" のように設定する。
 */
export const SCREEN_TAGS: string[] = (
  process.env.NEXT_PUBLIC_SCREEN_TAGS ?? "all"
)
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean)
  .slice(0, 30); // array-contains-any の上限

/** 背景モザイクのグリッド */
export const MOSAIC_COLS = 6;
export const MOSAIC_ROWS = 4;
export const MOSAIC_SIZE = MOSAIC_COLS * MOSAIC_ROWS;

/** 中央でアピールする時間 (ms) */
export const SPOTLIGHT_HOLD_MS = 4200;

/** 流れるコメントのレーン数と速度 */
export const COMMENT_LANES = 9;
export const COMMENT_SPEED_PX_PER_SEC = 200;
export const MAX_FLOWING = 28;

/** 購読するドキュメント数 */
export const POST_WINDOW = 40;
export const COMMENT_WINDOW = 30;
