import type { CoupleNames } from "@/lib/opening-names";

/** 招待状の中身。本物は Firestore の config/invitation にあり、サーバーだけが読んで API から返す */
export type InvitationContent = {
  groom: string;
  bride: string;
  dateLabel: string;
  receptionAt: string;
  venueName: string;
  venueAddress: string;
  /** Google マップの共有 URL（空なら出さない） */
  venueMapUrl: string;
  greeting: readonly string[];
};

/** オープニング演出「招集」に出す文字（Issue #131） */
export type OpeningContent = {
  /** 招集のお知らせに出す日付（例: 20XX.XX.XX） */
  date: string;
  /** 招集のお知らせに出す会場（短い表記） */
  venue: string;
  /** 新郎新婦の名前の表記8通り。ゲストの LINE 名の書き方に合わせて選ぶ（lib/opening-names.ts） */
  names: CoupleNames;
};

/** Firestore の config/invitation の形（招待状の中身 + オープニング） */
export type InvitationConfig = InvitationContent & { opening: OpeningContent };

/** GET /api/guest/invitation の応答 */
export type InvitationStatus = {
  /** パスコードを通ったか（登録済み・管理者も含む） */
  cleared: boolean;
  /** 登録フォームを送信済みか */
  registered: boolean;
  /**
   * 招待状の中身が用意できているか。cleared なのに false なら、config/invitation が未設定か壊れている
   * （画面は「準備中」を出す。架空の名前は出さない）。
   */
  ready: boolean;
  /** cleared かつ ready のときだけ入る */
  invitation?: InvitationContent;
  /** cleared かつ ready のときだけ入る */
  opening?: OpeningContent;
};

/** GET / POST /api/guest/reaction の応答 */
export type ReactionStatus = {
  /** 保存済みのリアクションタイム (ms)。記録が無ければ null */
  reactionMs: number | null;
  /** POST のとき: 今回の値が記録になったか（すでに記録があれば false） */
  recorded?: boolean;
};
