/** ランキングの1行。★uid・本名・LINE の情報は入れない★（GET /api/guest/reaction/ranking） */
export type ReactionRankingRow = {
  /** 順位。1/100 秒で同じタイムは同じ順位 */
  rank: number;
  /** 公開のニックネーム（guests.nickname） */
  nickname: string;
  photoURL: string;
  reactionMs: number;
  /** 呼び出した本人の行か */
  isMe: boolean;
};

/** GET /api/guest/reaction/ranking?tag= の応答 */
export type ReactionRanking = {
  tag: string;
  /** そのグループで記録がある人数 */
  total: number;
  /** 上位（RANKING_TOP 件まで） */
  rows: ReactionRankingRow[];
  /** 本人の行（圏外でも入る）。記録が無い・そのグループにいない（管理者）ときは null */
  me: ReactionRankingRow | null;
};
