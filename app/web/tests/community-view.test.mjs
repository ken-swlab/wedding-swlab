// コミュニティの、人によって変わる部分（Issue #286）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCommunityView } from "../src/lib/community-view.ts";
import { rankEntries } from "../src/lib/reaction-ranking.ts";

const members = [
  { nickname: "あや", photoURL: "a", secondOnly: false },
  { nickname: "けん", photoURL: "k", secondOnly: true },
];
const ranked = rankEntries([
  { uid: "u1", reactionMs: 250, recordedAtMs: 1, nickname: "あや", photoURL: "a" },
  { uid: "u2", reactionMs: 300, recordedAtMs: 2, nickname: "けん", photoURL: "k" },
]);
const base = { group: { members, ranked }, allTag: "all", top: 50, self: { nickname: "わたし", photoURL: "m" } };

test("グループ: 仲間の一覧とランキング。自分の行に isMe", () => {
  const v = buildCommunityView({ ...base, tag: "c_1", uid: "u2", inGroup: true, mine: { reactionMs: 300, recordedAtMs: 2 } });
  assert.equal(v.members.count, 2);
  assert.equal(v.members.members.length, 2);
  assert.deepEqual(v.ranking.rows.map((r) => [r.rank, r.nickname, r.isMe]), [[1, "あや", false], [2, "けん", true]]);
  assert.equal(v.ranking.me.rank, 2);
  assert.equal(v.myRecord, 300);
  assert.equal(JSON.stringify(v).includes("u1"), false, "uid を返さない");
});

test("全員: 仲間は人数だけ、ランキングは本人以外を伏せる", () => {
  const v = buildCommunityView({ ...base, tag: "all", uid: "u2", inGroup: true, mine: { reactionMs: 300, recordedAtMs: 2 } });
  assert.equal(v.members.members, undefined);
  assert.equal(v.members.count, 2);
  assert.deepEqual(v.ranking.rows.map((r) => [r.nickname, r.photoURL]), [["", ""], ["けん", "k"]]);
  assert.equal(v.ranking.anonymous, true);
});

test("記録した直後（使い回しに自分がいない）でも、自分の順位をその場で出す", () => {
  const v = buildCommunityView({ ...base, tag: "c_1", uid: "u3", inGroup: true, mine: { reactionMs: 200, recordedAtMs: 9 } });
  assert.equal(v.ranking.total, 3);
  assert.deepEqual(v.ranking.me, { rank: 1, nickname: "わたし", photoURL: "m", reactionMs: 200, isMe: true });
  assert.equal(v.ranking.rows[1].rank, 2);
});

test("そのグループにいない人（管理者が見るとき）は、自分を足さない", () => {
  const v = buildCommunityView({ ...base, tag: "c_1", uid: "admin", inGroup: false, mine: { reactionMs: 100, recordedAtMs: 9 } });
  assert.equal(v.ranking.total, 2);
  assert.equal(v.ranking.me, null);
  assert.equal(v.myRecord, 100);
});

test("記録が無ければ me も myRecord も null", () => {
  const v = buildCommunityView({ ...base, tag: "c_1", uid: "u9", inGroup: true, mine: null });
  assert.equal(v.ranking.me, null);
  assert.equal(v.myRecord, null);
});
