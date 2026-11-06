// 先読みの数の決め方（Issue #255）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { galleryPrefetchCount, isSlowConnection, nextRange, timelinePrefetchCount } from "../src/lib/prefetch.ts";

test("電波が悪いかの判定（分からない端末は悪くない扱い）", () => {
  assert.equal(isSlowConnection(undefined), false);
  assert.equal(isSlowConnection({}), false);
  assert.equal(isSlowConnection({ effectiveType: "4g" }), false);
  assert.equal(isSlowConnection({ effectiveType: "3g" }), false);
  assert.equal(isSlowConnection({ effectiveType: "2g" }), true);
  assert.equal(isSlowConnection({ effectiveType: "slow-2g" }), true);
  assert.equal(isSlowConnection({ effectiveType: "4g", saveData: true }), true);
});

test("タイムラインは次の3件、電波が悪いと1件", () => {
  assert.equal(timelinePrefetchCount(undefined), 3);
  assert.equal(timelinePrefetchCount({ effectiveType: "2g" }), 1);
  assert.equal(timelinePrefetchCount({ saveData: true }), 1);
});

test("ギャラリーは1画面分（3列）、電波が悪いと1枚", () => {
  // 幅 390・高さ 844 → 1マス 130px → 7行 × 3列
  assert.equal(galleryPrefetchCount(undefined, { width: 390, height: 844 }, 3), 21);
  assert.equal(galleryPrefetchCount({ effectiveType: "slow-2g" }, { width: 390, height: 844 }, 3), 1);
});

test("見えている一番後ろの次から数える", () => {
  const list = [0, 1, 2, 3, 4, 5];
  assert.deepEqual(nextRange(list, 1, 3), [2, 3, 4]);
  assert.deepEqual(nextRange(list, 4, 3), [5]);
  assert.deepEqual(nextRange(list, -1, 3), []);
  assert.deepEqual(nextRange(list, 2, 0), []);
});
