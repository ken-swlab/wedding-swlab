export type EpisodeStatus = "pending" | "approved" | "rejected";

/**
 * ゲストから集めた思い出エピソード。
 * ミニAI の RAG コンテキストと、オープニングムービーの素材になる。
 *
 * 構造は3層に分けてある:
 *   1. ゲストの生投稿（管理者は編集しない。出典として残す）
 *   2. 管理者が整えた AI 用のテキスト
 *   3. 紐付けと可視性
 */
export type Episode = {
  id: string;
  status: EpisodeStatus;

  // ---- 1. ゲストの生投稿 ----
  authorUid: string;
  /** 表示用の非正規化。ニックネームを入れる */
  authorName: string;
  /** お題の id（config/episodes.ts の EPISODE_THEMES） */
  theme: string;
  originalText: string;
  photoUrls: string[];
  /** 投稿日時（ミリ秒）。Timestamp ではなく number なのは JSON で往復させるため */
  createdAt: number;

  // ---- 2. 管理者が整えた内容 ----
  title: string;
  period: string;
  /** ★AI に読ませる本文★ 生テキストを整形したもの */
  content: string;

  // ---- 3. 紐付け ----
  /** 「誰についての話か」。グループ単位 */
  targetTags: string[];
  /** 「誰についての話か」。個人単位 */
  targetUids: string[];

  /**
   * 「誰に見せてよいか」。
   * ★targetTags とは別物★
   *   target は主題、visibleTo は権限。兼務させると
   *   限定公開のエピソードが他のゲストへの AI 回答に混ざる。
   *   posts と同じ語彙なので、取得クエリも Rules もそのまま流用できる。
   */
  visibleToTags: string[];

  updatedAt?: number;
  reviewedBy?: string;
};

/** 一覧 API のレスポンス */
export type EpisodeListResponse = {
  ok: boolean;
  episodes: Episode[];
  message?: string;
};

/** 管理者が保存するときのペイロード */
export type EpisodeUpdatePayload = {
  id: string;
  status?: EpisodeStatus;
  title?: string;
  period?: string;
  content?: string;
  targetTags?: string[];
  targetUids?: string[];
  visibleToTags?: string[];
};
