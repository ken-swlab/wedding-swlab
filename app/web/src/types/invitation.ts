import type { CoupleNames } from "@/lib/opening-names";

/** 招待状の中身。本物は Firestore の config/invitation にあり、サーバーだけが読んで API から返す */
export type InvitationContent = {
  groom: string;
  bride: string;
  dateLabel: string;
  venueName: string;
  venueAddress: string;
  /** Google マップの共有 URL（空なら出さない） */
  venueMapUrl: string;
  greeting: readonly string[];
  /**
   * 当日の流れ（Issue #166）。招待状の PROGRAM・エントリー画面の上部・挙式の選択肢の時刻は、すべてここから組み立てる。
   * ★時刻をコードに書かない★ 以前の receptionAt（文字列）と ceremony（Issue #146）はこれに移した。
   */
  program: readonly ProgramItem[];
  /**
   * 会費（Issue #148）。config/invitation ではなく config/payment から API が足す。未設定なら出さない。
   * ★お車代の額は入れない★（招待状に書かない）
   */
  fee?: { partyYen: number; secondYen: number };
  /**
   * 確認までの目安（Issue #157 B-4。例: 通常、1〜2 日以内に確認します。）。
   * ★いまは画面に出さない★（Issue #167 で承認待ちを1画面に収めるため外した）。設定済みの config/invitation を
   *   壊さないよう、読み取りだけ残している。
   */
  approvalNote?: string;
};

/**
 * 当日の流れの行の役目（Issue #166）。挙式の選択肢の時刻を、どの行から取るかを決める。
 *   gather … 挙式に参加する人の集合 ／ ceremony … 挙式 ／ reception … 受付 ／ party … 披露宴
 * 役目のない行（2次会など）には付けない。同じ役目は1行だけ。
 */
export type ProgramRole = "gather" | "ceremony" | "reception" | "party";

/** 当日の流れの1行。時刻は "HH:MM"、未定なら ""（画面は --:-- と出す） */
export type ProgramItem = {
  time: string;
  title: string;
  /** 補足（空なら出さない） */
  note: string;
  /** 点をアクセント色で塗り、エントリー画面のチップの枠もアクセント色にする（挙式・披露宴） */
  highlight: boolean;
  role?: ProgramRole;
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
