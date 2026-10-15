// config/welcome の形と、ゲストのタグから投稿を選ぶ処理（Issue #150）。実行: cd app/web && npm test
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

test("グループのタグを all・guest より優先し、無ければ既定", () => {
  const c = parseWelcomeConfig({ defaultPostId: "pd", byTag: { all: "pa", friends_bride: "pb" }, message: "既定", messages: { friends_bride: "新婦友人へ" } }).value;
  assert.deepEqual(pickWelcome(c, ["all", "friends_bride", "guest"]), { postId: "pb", message: "新婦友人へ", tag: "friends_bride" });
  assert.deepEqual(pickWelcome(c, ["all", "guest", "family"]), { postId: "pa", message: "既定", tag: "all" });
  const d = parseWelcomeConfig({ defaultPostId: "pd" }).value;
  assert.deepEqual(pickWelcome(d, ["all", "guest"]), { postId: "pd", message: "", tag: null });
});
