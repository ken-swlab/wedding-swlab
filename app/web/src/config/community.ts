/**
 * コミュニティ（/guestbook/community。Issue #174）の決まりごと。クライアントとサーバーの両方で使う。
 * ランキングの決まりごとは src/config/reaction.ts。
 */
import { RANKING_ALL_TAG } from "@/config/reaction";

/** 「全員」のタグ。グループの切り替えの先頭に置く。仲間は人数だけ、ランキングは名前を伏せる */
export const COMMUNITY_ALL_TAG = RANKING_ALL_TAG;

/** 1つのタグで読むゲストの上限（サーバーの集計）。1つの式の人数を十分に超える値 */
export const COMMUNITY_GUEST_LIMIT = 500;

/** 回答フォームの「ご出欠」の下に出す注意書き。★参加予定を同じグループのゲストに見せるので外さない★ */
export const COMMUNITY_ATTENDANCE_NOTICE =
  "参加される場合、同じグループのゲストに、ニックネームとアイコンが「参加予定」として表示されます。";
