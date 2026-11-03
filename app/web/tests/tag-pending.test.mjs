// 名前がまだ分からないカスタムタグの判定（Issue #231）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { isTagPending, registerCustomTags, tagDef } from "../src/config/tags.ts";

test("辞書が届く前のカスタムタグだけ pending", () => {
  registerCustomTags([]);
  assert.equal(isTagPending("c_44c6023a"), true);
  // 組み込みタグと、カスタムタグの形でない未知の ID は pending にしない（今どおり）
  assert.equal(isTagPending("all"), false);
  assert.equal(isTagPending("couple"), false);
  assert.equal(isTagPending("unknown_tag"), false);
});

test("辞書が届いたら名前で引け、名前を変えると新しい名前になる", () => {
  registerCustomTags([{ id: "c_44c6023a", label: "水泳部", className: "", selectable: true }]);
  assert.equal(isTagPending("c_44c6023a"), false);
  assert.equal(tagDef("c_44c6023a").label, "水泳部");
  registerCustomTags([{ id: "c_44c6023a", label: "水泳部OB", className: "", selectable: true }]);
  assert.equal(tagDef("c_44c6023a").label, "水泳部OB");
  // アーカイブ済みも辞書にあるので pending にしない（既存の投稿のバッジを出す）
  registerCustomTags([{ id: "c_44c6023a", label: "水泳部", className: "", selectable: true, archived: true }]);
  assert.equal(isTagPending("c_44c6023a"), false);
});
