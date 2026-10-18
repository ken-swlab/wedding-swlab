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
  /**
   * 点をつなぐ縦線。インクの色の 25%（Issue #178）。
   * ★招待状（読む場面）の色はインクとオレンジの2色だけ★ 水泳の色（コースロープの赤・青など）を足さない。
   */
  line: "#2b292540",
} as const;

/** 2回目以降に招待状を開いた人に、画面下の「エントリーする」を下からふわっと出すまで (ms。Issue #166) */
export const ENTRY_BAR_DELAY_MS = 900;

/**
 * 1画面目（名前・日付・会場）を画面の高さより低くする分 (px。Issue #178)。
 * シルエット写真の上端が画面の下にちらっと見え、続きがあると分かるように。
 */
export const INVITATION_PEEK_PX = 72;

/**
 * 招待状を読んだ（回答した・一度最後まで読んだ）印を置く localStorage のキー（Issue #178）。
 * 印があれば、2回目以降は画面下の「エントリーする」を最初から出す。中身は "1" だけ（個人の情報は置かない）。
 */
export const INVITATION_READ_STORAGE_KEY = "wedding:invitation-read";
