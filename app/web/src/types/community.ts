/** 仲間（参加予定のメンバー）の1人。★uid・本名・LINE の情報・アレルギーは入れない★（GET /api/guest/community） */
export type CommunityMember = {
  /** 公開のニックネーム（guests.nickname） */
  nickname: string;
  photoURL: string;
  /** 2次会のみの参加か（「2次会から」を添える） */
  secondOnly: boolean;
};

/** 仲間の部分（GET /api/guest/community?tag= の members） */
export type CommunityMembers = {
  tag: string;
  /** 参加予定の人数（承認済みで、出欠が「欠席」以外） */
  count: number;
  /** 一覧。「全員」（all）のときは返さない（人数だけ） */
  members?: CommunityMember[];
};

/** GET /api/guest/community?tag= の応答（Issue #286。仲間・ランキング・自分の記録をまとめたもの） */
export type CommunityResponse = {
  tag: string;
  members: CommunityMembers;
  ranking: import("./reaction").ReactionRanking;
  /** 自分の記録（ミリ秒）。無ければ null */
  myRecord: number | null;
};
