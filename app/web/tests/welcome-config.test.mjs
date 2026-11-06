// config/welcome の形と、ゲストのタグから投稿を選ぶ処理（Issue #150・#215・#248）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWelcomeConfig, pickWelcome } from "../src/lib/welcome-config.ts";

test("形の確認", () => {
  assert.deepEqual(parseWelcomeConfig({}), { ok: true, value: { defaultPostId: "", byTag: {}, message: "", messages: {} } });
  const ok = parseWelcomeConfig({ defaultPostId: "p1", byTag: { friends_groom: "p2" }, message: " ありがとう ", messages: { c_0000abcd: "部活のみんなへ" } });
  assert.deepEqual(ok, { ok: true, value: { defaultPostId: "p1", byTag: { friends_groom: "p2" }, message: "ありがとう", messages: { c_0000abcd: "部活のみんなへ" } } });
  assert.deepEqual(parseWelcomeConfig(null), { ok: false, field: "(全体)" });
  assert.deepEqual(parseWelcomeConfig({ defaultPostId: "a/b" }), { ok: false, field: "defaultPostId" });
  assert.deepEqual(parseWelcomeConfig({ byTag: { all: 1 } }), { ok: false, field: "byTag" });
  assert.deepEqual(parseWelcomeConfig({ byTag: ["p1"] }), { ok: false, field: "byTag" });
  assert.deepEqual(parseWelcomeConfig({ message: "あ".repeat(61) }), { ok: false, field: "message" });
  assert.deepEqual(parseWelcomeConfig({ messages: { all: "" } }), { ok: false, field: "messages" });
});

test("以前の priority は無視する（残っていても、形が違っても壊れない。Issue #248）", () => {
  assert.deepEqual(parseWelcomeConfig({ defaultPostId: "pd", priority: ["c_0000abcd", "family"] }), { ok: true, value: { defaultPostId: "pd", byTag: {}, message: "", messages: {} } });
  assert.equal(parseWelcomeConfig({ priority: "family" }).ok, true);
  assert.equal(parseWelcomeConfig({ priority: [1, 1] }).ok, true);
});

test("グループのタグを all・guest より優先し、無ければ既定", () => {
  const c = parseWelcomeConfig({ defaultPostId: "pd", byTag: { all: "pa", friends_bride: "pb" }, message: "既定", messages: { friends_bride: "新婦友人へ" } }).value;
  assert.deepEqual(pickWelcome(c, ["all", "friends_bride", "guest"], []), { postId: "pb", message: "新婦友人へ", tag: "friends_bride" });
  assert.deepEqual(pickWelcome(c, ["all", "guest", "family"], []), { postId: "pa", message: "既定", tag: "all" });
  const d = parseWelcomeConfig({ defaultPostId: "pd" }).value;
  assert.deepEqual(pickWelcome(d, ["all", "guest"], []), { postId: "pd", message: "", tag: null });
});

test("重なったタグは、タグの並び順で選ぶ（Issue #248）", () => {
  const c = parseWelcomeConfig({ defaultPostId: "pd", byTag: { c_0000aaaa: "pa", c_0000bbbb: "pb" }, message: "既定", messages: { c_0000aaaa: "Aへ", c_0000bbbb: "Bへ" } }).value;
  const tags = ["all", "guest", "c_0000aaaa", "c_0000bbbb"];
  assert.deepEqual(pickWelcome(c, tags, ["c_0000aaaa", "c_0000bbbb"]), { postId: "pa", message: "Aへ", tag: "c_0000aaaa" });
  // タグの管理で並び順を入れ替えると、届く写真も入れ替わる
  assert.deepEqual(pickWelcome(c, tags, ["c_0000bbbb", "c_0000aaaa"]), { postId: "pb", message: "Bへ", tag: "c_0000bbbb" });
  // 上のタグに写真が無ければ、次のタグの写真。一言は上のタグのもの
  const noPhoto = parseWelcomeConfig({ ...c, byTag: { c_0000bbbb: "pb" } }).value;
  assert.deepEqual(pickWelcome(noPhoto, tags, ["c_0000aaaa", "c_0000bbbb"]), { postId: "pb", message: "Aへ", tag: "c_0000bbbb" });
});

test("all・guest は並び順のどこにあっても最後（Issue #215・#248）", () => {
  const c = parseWelcomeConfig({ defaultPostId: "pd", byTag: { family: "pf" }, message: "ようこそ", messages: { family: "親族へ" } }).value;
  assert.deepEqual(pickWelcome(c, ["all", "guest"], ["family"]), { postId: "pd", message: "ようこそ", tag: null });
  const g = parseWelcomeConfig({ defaultPostId: "pd", byTag: { all: "pall", family: "pf" } }).value;
  assert.deepEqual(pickWelcome(g, ["all", "guest", "family"], ["all", "guest", "family"]).postId, "pf");
});

test("並び順にないタグは、並び順の最後に置いて扱う（文字順。Issue #248）", () => {
  const c = parseWelcomeConfig({ defaultPostId: "pd", byTag: { c_0000aaaa: "pa", c_0000bbbb: "pb", friends_groom: "pg" } }).value;
  assert.deepEqual(pickWelcome(c, ["all", "c_0000bbbb", "c_0000aaaa", "friends_groom"], ["friends_groom"]).postId, "pg");
  assert.deepEqual(pickWelcome(c, ["all", "c_0000bbbb", "c_0000aaaa"], ["friends_groom"]).postId, "pa");
  assert.deepEqual(pickWelcome(c, ["all", "c_0000bbbb"], ["friends_groom"]).postId, "pb");
});
