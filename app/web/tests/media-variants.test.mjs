// 一覧用の小さい写真のキー（Issue #251）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { fitWithin, variantKey } from "../src/lib/media-variants.ts";

const base = "u/line:U123/t/3f2a1b4c-0d9e-4c55-9a7b-0123456789ab.jpg";

test("軽量版のキーから小さい版のキーを決める", () => {
  assert.equal(variantKey(base, "feed"), "u/line:U123/t/3f2a1b4c-0d9e-4c55-9a7b-0123456789ab__feed.jpg");
  assert.equal(variantKey(base, "grid"), "u/line:U123/t/3f2a1b4c-0d9e-4c55-9a7b-0123456789ab__grid.jpg");
  // 動画の軽量版（拡張子が mp4 など）からポスターのキー
  assert.equal(variantKey(base.replace(".jpg", ".mp4"), "poster"), "u/line:U123/t/3f2a1b4c-0d9e-4c55-9a7b-0123456789ab__poster.jpg");
});

test("軽量版のキーの形でなければ決めない（原本・小さい版・ほかの場所）", () => {
  assert.equal(variantKey(base.replace("/t/", "/o/"), "feed"), null);
  assert.equal(variantKey("u/line:U123/t/3f2a1b4c-0d9e-4c55-9a7b-0123456789ab__feed.jpg", "feed"), null);
  assert.equal(variantKey("site/invitation/x.jpg", "feed"), null);
  assert.equal(variantKey("../u/a/t/3f2a1b4c-0d9e-4c55-9a7b-0123456789ab.jpg", "feed"), null);
});

test("長辺を縮める", () => {
  assert.deepEqual(fitWithin(1920, 1440, 828), { width: 828, height: 621 });
  assert.deepEqual(fitWithin(1440, 1920, 400), { width: 300, height: 400 });
  assert.deepEqual(fitWithin(300, 200, 400), { width: 300, height: 200 });
});

test("下絵（Issue #253）は JPEG の data URL で 1024 文字以下だけ", async () => {
  const { isPlaceholder, PLACEHOLDER_PREFIX } = await import("../src/lib/media-variants.ts");
  assert.equal(isPlaceholder(`${PLACEHOLDER_PREFIX}/9j/4AAQSkZJRg==`), true);
  assert.equal(isPlaceholder(PLACEHOLDER_PREFIX + "A".repeat(1024 - PLACEHOLDER_PREFIX.length)), true);
  assert.equal(isPlaceholder(PLACEHOLDER_PREFIX + "A".repeat(1025 - PLACEHOLDER_PREFIX.length)), false);
  assert.equal(isPlaceholder("data:image/png;base64,iVBORw0KGgo="), false);
  assert.equal(isPlaceholder(`${PLACEHOLDER_PREFIX}<script>`), false);
  assert.equal(isPlaceholder(PLACEHOLDER_PREFIX), false);
  assert.equal(isPlaceholder(1), false);
  assert.equal(isPlaceholder(undefined), false);
});
