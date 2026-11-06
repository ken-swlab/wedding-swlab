// 組み込みのタグの上書き・隠す・並び順の統一（Issue #248）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allTagDefs,
  applyTagDocs,
  canEditTag,
  canHideTag,
  isTagOrderSaved,
  orderedTagDefs,
  tagDef,
  tagOrderIds,
} from "../src/config/tags.ts";

test("上書きが無ければ TAG_DEFS のまま。並びは組み込み → 作ったタグ", () => {
  applyTagDocs([{ id: "c_0000aaaa", data: { label: "水泳部", order: 0 } }]);
  assert.equal(tagDef("colleagues").label, "会社関係");
  assert.equal(isTagOrderSaved(), false);
  const ids = tagOrderIds();
  assert.ok(ids.indexOf("colleagues") < ids.indexOf("c_0000aaaa"));
  assert.equal(tagDef("c_0000aaaa").custom, true);
});

test("組み込みのタグの名前・色・コミュニティを上書きできる", () => {
  applyTagDocs([{ id: "colleagues", data: { label: "職場", palette: "sky", community: false } }]);
  assert.equal(tagDef("colleagues").label, "職場");
  assert.match(tagDef("colleagues").className, /sky/);
  assert.equal(tagDef("colleagues").community, false);
  // 上書きのドキュメントは「作ったタグ」として扱わない
  assert.notEqual(tagDef("colleagues").custom, true);
});

test("隠せる組み込みのタグは隠すとピッカーから消え、表示は残る", () => {
  applyTagDocs([{ id: "colleagues", data: { archived: true } }]);
  assert.equal(allTagDefs().some((t) => t.id === "colleagues"), false);
  assert.equal(tagDef("colleagues").label, "会社関係");
  assert.equal(orderedTagDefs(true).some((t) => t.id === "colleagues"), true);
});

test("隠せないタグ（all・guest・couple・family）の archived は無視する。guest は名前も変えない", () => {
  for (const id of ["all", "guest", "couple", "family"]) assert.equal(canHideTag(id), false);
  assert.equal(canHideTag("friends_groom"), true);
  assert.equal(canHideTag("c_0000aaaa"), true);
  assert.equal(canEditTag("guest"), false);
  assert.equal(canEditTag("family"), true);
  applyTagDocs([
    { id: "family", data: { archived: true, label: "親戚" } },
    { id: "guest", data: { label: "x", archived: true } },
  ]);
  assert.equal(tagDef("family").archived, false);
  assert.equal(tagDef("family").label, "親戚");
  assert.equal(tagDef("guest").label, "承認済");
  assert.equal(allTagDefs().some((t) => t.id === "family"), true);
});

test("並び順を保存すると、組み込みと作ったタグが1つの並びになる", () => {
  applyTagDocs([
    { id: "c_0000aaaa", data: { label: "水泳部", order: 0 } },
    { id: "friends_groom", data: { order: 1 } },
    { id: "family", data: { order: 2 } },
  ]);
  assert.equal(isTagOrderSaved(), true);
  const ids = tagOrderIds();
  assert.ok(ids.indexOf("c_0000aaaa") < ids.indexOf("friends_groom"));
  assert.ok(ids.indexOf("friends_groom") < ids.indexOf("family"));
});
