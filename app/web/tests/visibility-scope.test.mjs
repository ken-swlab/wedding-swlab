// 投稿画面の公開範囲の選び方（Issue #272）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { SCOPE_NARROW_NOTE, SCOPE_WIDEN_NOTE, defaultScope, scopeChangeNotes, scopeForDisplay, toggleScope } from "../src/lib/visibility-scope.ts";

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

// 公開範囲の初期値（Issue #299）。defs はタグの管理の並び順で渡す
const defs = [
  { id: "all", selectable: true },
  { id: "guest", selectable: false, system: true },
  { id: "couple", selectable: true },
  { id: "friends_groom", selectable: true },
  { id: "c_hidden", selectable: true, archived: true },
  { id: "c_locked", selectable: false },
  { id: "c_company", selectable: true },
];

test("初期値：持っているタグのうち、並び順でいちばん上", () => {
  assert.deepEqual(defaultScope(["all", "guest", "c_company", "friends_groom"], defs), ["friends_groom"]);
  assert.deepEqual(defaultScope(["all", "guest", "c_company"], defs), ["c_company"]);
});

test("初期値：全員・承認済・新郎新婦・隠したタグ・選べないタグは候補にしない", () => {
  assert.deepEqual(defaultScope(["all", "guest", "couple", "c_hidden", "c_locked"], defs), ["all"]);
});

test("初期値：新郎新婦本人も、持っているタグのいちばん上（couple は外す）", () => {
  assert.deepEqual(defaultScope(["all", "guest", "couple", "c_company"], defs), ["c_company"]);
});

test("初期値：候補が無ければ「全員」。全員も無ければ空", () => {
  assert.deepEqual(defaultScope(["all", "guest"], defs), ["all"]);
  assert.deepEqual(defaultScope(["guest"], defs), []);
});

test("初期値：辞書に無いタグ（まだ届いていないカスタムタグ）は候補にしない", () => {
  assert.deepEqual(defaultScope(["all", "c_unknown"], defs), ["all"]);
});

// 公開範囲を変えるときの注意書き（Issue #300）
test("注意書き：全員を外すと狭める、全員にすると広げる", () => {
  assert.deepEqual(scopeChangeNotes(["all"], ["friends_groom"]), [SCOPE_NARROW_NOTE]);
  assert.deepEqual(scopeChangeNotes(["friends_groom"], ["all"]), [SCOPE_WIDEN_NOTE]);
});

test("注意書き：タグを外すと狭める、足すと広げる、入れ替えは両方", () => {
  assert.deepEqual(scopeChangeNotes(["friends_groom", "c_company"], ["friends_groom"]), [SCOPE_NARROW_NOTE]);
  assert.deepEqual(scopeChangeNotes(["friends_groom"], ["friends_groom", "c_company"]), [SCOPE_WIDEN_NOTE]);
  assert.deepEqual(scopeChangeNotes(["couple"], ["friends_groom"]), [SCOPE_NARROW_NOTE, SCOPE_WIDEN_NOTE]);
});

test("注意書き：変わっていなければ出さない", () => {
  assert.deepEqual(scopeChangeNotes(["friends_groom"], ["friends_groom"]), []);
});
