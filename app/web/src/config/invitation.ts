/**
 * 招待状（/invitation）の画面の決まりごと。クライアントで使う。
 * ★新郎新婦の名前・会場はここに書かない★ 本物は Firestore の config/invitation にだけあり、
 *   サーバー（src/lib/invitation-server.ts）が読んで API から返す。
 * オープニング演出のタイミングは src/config/opening.ts。
 */
import { OPENING_COLORS } from "@/config/opening";

/** オープニングのタイムの下に添える一言 */
export const OPENING_NOTE = {
  /** 一発勝負（これが記録になる）。承認前 */
  recordPending: "承認後、ランキングで見られます",
  /** 一発勝負（これが記録になる）。承認済み（コミュニティから） */
  record: "これがあなたの記録です",
  /** すでに記録がある（見返し） */
  replay: "見返しのため、記録はされません",
  /** 管理者の確認用ページ */
  test: "テストのため、記録はされません",
} as const;

/**
 * 招待状の色（Issue #166）。オープニングと地続きの専用の場面なので、テーマ（stone など）には従わせない
 * （config/opening.ts の OPENING_COLORS と同じ扱い）。
 */
export const INVITATION_COLORS = {
  /** 紙の地（招待状とエントリー画面） */
  paper: "#faf9f7",
  /** 当日の流れの点の縁と文字 */
  ink: "#2b2925",
  /** 挙式・披露宴の点とチップの枠（電光掲示板のオレンジ。OPENING_COLORS.led と同じ） */
  led: OPENING_COLORS.led,
  /** 挙式・披露宴のチップの地 */
  ledSoft: "#fff6ee",
  /** 「&」の色 */
  amp: "#b08a5a",
  /** 点をつなぐ縦線。プールのコースロープの柄（赤・白・青・白の繰り返し） */
  rope: "repeating-linear-gradient(180deg, #d9534f 0 6px, #fff 6px 12px, #3b82c4 12px 18px, #fff 18px 24px)",
} as const;

/** 招待状が出てから、画面下の「エントリーする」を下からふわっと出すまで (ms。Issue #166) */
export const ENTRY_BAR_DELAY_MS = 900;
