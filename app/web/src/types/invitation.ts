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
  /** 写真（Issue #173）。いまは1画面目の直後のシルエットだけ。未設定なら枠ごと出さない */
  photos?: { hero?: InvitationHeroPhoto };
  /** ふたりから（Issue #173）。上から順にカードで出す（新郎・新婦の順。最大2枚）。空なら見出しごと出さない */
  fromUs: readonly InvitationFromUs[];
  /** 当日のおたのしみ（Issue #173）。空なら見出しごと出さない */
  highlights: readonly InvitationHighlight[];
  /**
   * 以前のご挨拶（greeting）を出すか（Issue #173）。未設定なら出さない。
   * ★greeting のデータは残す★ true にすれば、PROGRAM のあとに MESSAGE として戻る。
   */
  showGreeting: boolean;
};

/**
 * 招待状の写真の URL（Issue #173）。次のどちらか（lib/invitation-config.ts が確かめる）。
 *   /placeholders/invitation/… … 仮の画像（public/。実在の人物を含まないものだけ）
 *   https://…                    … 本物の写真。scripts/ops.mjs invitation photo set が公開バケットに置いた URL
 * 空なら未設定（その写真の部分を出さない）。
 */
export type InvitationPhotoUrl = string;

/** 1画面目の直後のシルエット写真（縦横比 4:5）と、上に重ねる文字 */
export type InvitationHeroPhoto = {
  url: InvitationPhotoUrl;
  /** 読み上げ用の説明（必須） */
  alt: string;
  /** 重ねる日付（等幅の数字。空なら出さない） */
  overlayDate: string;
  /** 日付の下に重ねる一言（空なら出さない） */
  overlayText: string;
};

/** ふたりからのカード1枚。写真が未設定なら、名前の頭文字の丸を出す */
export type InvitationFromUs = {
  name: string;
  photoUrl: InvitationPhotoUrl;
  /** 読み上げ用の説明（必須） */
  alt: string;
  message: string;
};

/** 当日のおたのしみのアイコン（線画）の種類 */
export type InvitationHighlightKey = "food" | "drink" | "game";

/** 当日のおたのしみのカード1枚（文字中心） */
export type InvitationHighlight = {
  key: InvitationHighlightKey;
  title: string;
  body: string;
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
