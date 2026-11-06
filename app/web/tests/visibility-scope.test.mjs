// 投稿画面の公開範囲の選び方（Issue #272）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { scopeForDisplay, toggleScope } from "../src/lib/visibility-scope.ts";

test("個別のタグを選んだら「全員」を外す", () => {
  assert.deepEqual(toggleScope(["all"], "c_hama", true), ["c_hama"]);
  assert.deepEqual(toggleScope(["c_hama"], "friends_groom", true), ["c_hama", "friends_groom"]);
});

test("「全員」を選んだら個別のタグをすべて外す。「全員」だけのときに押しても空にしない", () => {
  assert.deepEqual(toggleScope(["c_hama", "friends_groom"], "all", true), ["all"]);
  assert.deepEqual(toggleScope(["all"], "all", true), ["all"]);
});

test("個別のタグを全部外したら「全員」に戻る", () => {
  assert.deepEqual(toggleScope(["c_hama"], "c_hama", true), ["all"]);
  assert.deepEqual(toggleScope(["c_hama", "friends_groom"], "c_hama", true), ["friends_groom"]);
});

test("「新郎新婦」は単独。外したら「全員」に戻る", () => {
  assert.deepEqual(toggleScope(["all"], "couple", true), ["couple"]);
  assert.deepEqual(toggleScope(["couple"], "c_hama", true), ["c_hama"]);
  assert.deepEqual(toggleScope(["couple"], "couple", true), ["all"]);
  assert.deepEqual(toggleScope(["couple"], "all", true), ["all"]);
});

test("「全員」を持たない人は、全部外すと空（今までどおり）", () => {
  assert.deepEqual(toggleScope(["c_hama"], "c_hama", false), []);
  assert.deepEqual(toggleScope(["c_hama"], "all", false), ["c_hama"]);
});

test("表示: 個別のタグがあれば「全員」を出さない", () => {
  assert.deepEqual(scopeForDisplay(["all", "c_hama"]), ["c_hama"]);
  assert.deepEqual(scopeForDisplay(["all"]), ["all"]);
  assert.deepEqual(scopeForDisplay(["couple"]), ["couple"]);
});
