import { rankEntries, type Ranked } from "./reaction-ranking.ts";

/**
 * コミュニティ（Issue #286）の、人によって変わる部分を組み立てる。サーバーの集計（タグごとに使い回す）から、
 * 呼び出した本人の応答を作る。★使い回すのは全員に共通の部分だけ★ 自分の行（me・isMe）と「全員」の伏せ方はここで毎回作る。
 *
 * ★返す中身は今までのルールのまま★ ニックネーム・アイコン・タイム・順位・自分かどうかだけ（uid・本名は返さない）。
 *   「全員」は仲間を人数だけにし、ランキングは本人以外の名前とアイコンを伏せる。
 * ★自分の記録は、使い回しの古さに関係なく正しく出す★ 集計に自分が入っていなければ（オープニングで記録した直後など）、
 *   自分の記録を足して、その場で順位を付け直す（そのグループの人のときだけ）。
 * ★このファイルは `@/` で値を import しない★（tests/ が Node でそのまま読み込む）
 */
export type GroupMember = { nickname: string; photoURL: string; secondOnly: boolean };
export type GroupEntry = { uid: string; reactionMs: number; recordedAtMs: number; nickname: string; photoURL: string };

/** タグごとに使い回す集計（サーバーの中だけ。uid を含むので、そのまま返さない） */
export type CommunityGroup = { members: GroupMember[]; ranked: Ranked<GroupEntry>[] };

export type RankingRow = { rank: number; nickname: string; photoURL: string; reactionMs: number; isMe: boolean };

export type CommunityView = {
  tag: string;
  members: { tag: string; count: number; members?: GroupMember[] };
  ranking: { tag: string; anonymous: boolean; total: number; rows: RankingRow[]; me: RankingRow | null };
  /** 自分の記録（ミリ秒）。無ければ null */
  myRecord: number | null;
};

export function buildCommunityView(args: {
  group: CommunityGroup;
  tag: string;
  allTag: string;
  top: number;
  uid: string;
  /** 本人がそのグループの一員か（そのタグを持つ承認済みの人。管理者がほかのタグを見るときは false） */
  inGroup: boolean;
  /** 本人の記録（reactionTimes/{uid} を毎回1件読んだもの）。無ければ null */
  mine: { reactionMs: number; recordedAtMs: number } | null;
  /** 本人の公開プロフィール（足すときの名前とアイコン） */
  self: { nickname: string; photoURL: string };
}): CommunityView {
  const { group, tag, allTag, top, uid, inGroup, mine, self } = args;
  const all = tag === allTag;

  let ranked = group.ranked;
  const cachedMe = ranked.find((r) => r.uid === uid);
  if (inGroup && mine && (!cachedMe || cachedMe.reactionMs !== mine.reactionMs)) {
    const others: GroupEntry[] = ranked
      .filter((r) => r.uid !== uid)
      .map((r) => ({ uid: r.uid, reactionMs: r.reactionMs, recordedAtMs: r.recordedAtMs, nickname: r.nickname, photoURL: r.photoURL }));
    ranked = rankEntries([...others, { uid, reactionMs: mine.reactionMs, recordedAtMs: mine.recordedAtMs, ...self }]);
  }

  const toRow = (r: Ranked<GroupEntry>): RankingRow => {
    const isMe = r.uid === uid;
    const hide = all && !isMe;
    return { rank: r.rank, nickname: hide ? "" : r.nickname, photoURL: hide ? "" : r.photoURL, reactionMs: r.reactionMs, isMe };
  };
  const me = ranked.find((r) => r.uid === uid);

  return {
    tag,
    members: all ? { tag, count: group.members.length } : { tag, count: group.members.length, members: group.members },
    ranking: { tag, anonymous: all, total: ranked.length, rows: ranked.slice(0, top).map(toRow), me: me ? toRow(me) : null },
    myRecord: mine ? mine.reactionMs : null,
  };
}
