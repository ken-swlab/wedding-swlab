/** ランキングの1行。★uid・本名・LINE の情報は入れない★（GET /api/guest/community） */
export type ReactionRankingRow = {
  /** 順位。1/100 秒で同じタイムは同じ順位 */
  rank: number;
  /** 公開のニックネーム（guests.nickname）。「全員」のときは本人以外 ""（Issue #174） */
  nickname: string;
  /** アイコン。「全員」のときは本人以外 "" */
  photoURL: string;
  reactionMs: number;
  /** 呼び出した本人の行か */
  isMe: boolean;
};

/** ランキングの部分（GET /api/guest/community?tag= の ranking） */
export type ReactionRanking = {
  tag: string;
  /** 本人以外の名前とアイコンを伏せたか（「全員」のとき。Issue #174） */
  anonymous: boolean;
  /** そのグループで記録がある人数 */
  total: number;
  /** 上位（RANKING_TOP 件まで） */
  rows: ReactionRankingRow[];
  /** 本人の行（圏外でも入る）。記録が無い・そのグループにいない（管理者）ときは null */
  me: ReactionRankingRow | null;
};
