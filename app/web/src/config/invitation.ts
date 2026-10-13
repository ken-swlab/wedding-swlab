/**
 * 招待状（/invitation）の画面の決まりごと。クライアントで使う。
 * ★新郎新婦の名前・会場はここに書かない★ 本物は Firestore の config/invitation にだけあり、
 *   サーバー（src/lib/invitation-server.ts）が読んで API から返す。
 * オープニング演出のタイミングは src/config/opening.ts。
 */

/** オープニングのタイムの下に添える一言 */
export const OPENING_NOTE = {
  /** 一発勝負（これが記録になる）。承認前 */
  recordPending: "承認後、ランキングで見られます",
  /** 一発勝負（これが記録になる）。承認済み（マイページから） */
  record: "これがあなたの記録です",
  /** すでに記録がある（見返し） */
  replay: "見返しのため、記録はされません",
  /** 管理者の確認用ページ */
  test: "テストのため、記録はされません",
} as const;
