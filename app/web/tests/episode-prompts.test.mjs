// 投稿画面のお題（Issue #284）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EPISODE_PROMPTS,
  LEGACY_EPISODE_PROMPTS,
  isCurrentPromptId,
  promptDef,
  withPromptHashtag,
} from "../src/config/episode-prompts.ts";
import { tokenizeText } from "../src/lib/text.ts";
import { isOnOrAfterEventDay } from "../src/lib/invitation-program.ts";

test("7つのお題が Issue の順・文言で並ぶ", () => {
  assert.deepEqual(
    EPISODE_PROMPTS.map((p) => [p.id, p.label, p.hashtag]),
    [
      ["laugh", "笑った話", "#笑った話"],
      ["trip", "旅・おでかけ", "#旅とおでかけ"],
      ["food", "ごはん・飲み会", "#ごはんと飲み会"],
      ["side", "意外な一面", "#意外な一面"],
      ["moved", "グッときた話", "#グッときた話"],
      ["swim", "水泳", "#水泳の思い出"],
      ["photo", "秘蔵写真", "#秘蔵写真"],
    ],
  );
});

test("ハッシュタグは本文の読み取り（tokenizeText）で1つのタグとして読める（記号で切れない）", () => {
  for (const p of [...EPISODE_PROMPTS, ...LEGACY_EPISODE_PROMPTS]) {
    if (!p.hashtag) continue;
    const tags = tokenizeText(`本文\n\n${p.hashtag}`).filter((t) => t.kind === "hashtag");
    assert.equal(tags.length, 1, p.id);
    assert.equal(tags[0].value, p.hashtag, p.id);
  }
});

test("ハッシュタグを末尾に1つだけ足す。同じタグがあれば足さない。お題なしはそのまま", () => {
  assert.equal(withPromptHashtag("楽しかった", "laugh"), "楽しかった\n\n#笑った話");
  assert.equal(withPromptHashtag("楽しかった ＃笑った話", "laugh"), "楽しかった ＃笑った話");
  assert.equal(withPromptHashtag("", "photo"), "#秘蔵写真");
  assert.equal(withPromptHashtag("楽しかった", ""), "楽しかった");
  assert.equal(withPromptHashtag("楽しかった", "other"), "楽しかった");
});

test("旧お題も表示できる。新しく投稿できるのは今のお題だけ", () => {
  assert.equal(promptDef("blunder")?.label, "やらかし");
  assert.equal(promptDef("nope"), null);
  assert.equal(isCurrentPromptId("laugh"), true);
  assert.equal(isCurrentPromptId("blunder"), false);
});

// ★日付は架空（CLAUDE.md のルール 4a。本物の開催日を書かない）★
test("開催日（日本時間）の前日までは false、当日からは true", () => {
  const jst = (s) => Date.parse(`${s}+09:00`);
  assert.equal(isOnOrAfterEventDay("2031.1.15", jst("2031-01-14T23:59:00")), false);
  assert.equal(isOnOrAfterEventDay("2031.1.15", jst("2031-01-15T00:00:00")), true);
  assert.equal(isOnOrAfterEventDay("2031.1.15", jst("2031-02-01T12:00:00")), true);
  assert.equal(isOnOrAfterEventDay("未定", jst("2030-01-01T00:00:00")), false);
});
