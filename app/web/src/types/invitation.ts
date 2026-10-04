/** 招待状の中身。サーバー（src/config/wedding.ts）だけが持ち、API から返す */
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

/** GET /api/guest/invitation の応答 */
export type InvitationStatus = {
  /** パスコードを通ったか（登録済み・管理者も含む） */
  cleared: boolean;
  /** 登録フォームを送信済みか */
  registered: boolean;
  /** cleared のときだけ入る */
  invitation?: InvitationContent;
};
