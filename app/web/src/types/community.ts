/** 仲間（参加予定のメンバー）の1人。★uid・本名・LINE の情報・アレルギーは入れない★（GET /api/guest/community/members） */
export type CommunityMember = {
  /** 公開のニックネーム（guests.nickname） */
  nickname: string;
  photoURL: string;
  /** 2次会のみの参加か（「2次会から」を添える） */
  secondOnly: boolean;
};

/** GET /api/guest/community/members?tag= の応答 */
export type CommunityMembers = {
  tag: string;
  /** 参加予定の人数（承認済みで、出欠が「欠席」以外） */
  count: number;
  /** 一覧。「全員」（all）のときは返さない（人数だけ） */
  members?: CommunityMember[];
};
