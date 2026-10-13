// リアクションタイムのランキングの並べ方（Issue #132）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { rankEntries } from "../src/lib/reaction-ranking.ts";

const e = (id, reactionMs, recordedAtMs = 0) => ({ id, reactionMs, recordedAtMs });
const view = (rows) => rows.map((r) => `${r.rank}:${r.id}`).join(" ");

test("速い順に並び、順位が付く", () => {
  assert.equal(view(rankEntries([e("c", 400), e("a", 180), e("b", 250)])), "1:a 2:b 3:c");
});

test("1/100 秒で同じタイムは同じ順位。次の順位は人数ぶん飛ぶ", () => {
  // 0.251 と 0.259 はどちらも 0.25。0.260 は 0.26
  assert.equal(view(rankEntries([e("a", 251, 2), e("b", 259, 1), e("c", 260), e("d", 180)])), "1:d 2:b 2:a 4:c");
  assert.equal(view(rankEntries([e("a", 200), e("b", 205), e("c", 209), e("d", 210)])), "1:a 1:b 1:c 4:d");
});

test("同じ順位の中は、先に記録した人が上", () => {
  assert.equal(view(rankEntries([e("late", 300, 20), e("early", 305, 10)])), "1:early 1:late");
});

test("空・1人でも動く。元の配列は変えない", () => {
  assert.deepEqual(rankEntries([]), []);
  const input = [e("b", 300), e("a", 200)];
  assert.equal(view(rankEntries(input)), "1:a 2:b");
  assert.equal(input[0].id, "b");
});
