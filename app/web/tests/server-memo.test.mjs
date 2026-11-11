// サーバーの使い回し（Issue #286）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { forget, memo } from "../src/lib/server-memo.ts";

test("TTL の間は前回の結果を返し、過ぎたら読み直す", async () => {
  forget();
  let t = 0;
  let calls = 0;
  const fn = async () => ++calls;
  assert.equal(await memo("a", 100, fn, () => t), 1);
  t = 50;
  assert.equal(await memo("a", 100, fn, () => t), 1);
  t = 150;
  assert.equal(await memo("a", 100, fn, () => t), 2);
});

test("同時に来た呼び出しは、実行中の1回を使い回す", async () => {
  forget();
  let calls = 0;
  let release;
  const fn = () => {
    calls += 1;
    return new Promise((r) => (release = () => r("v")));
  };
  const p1 = memo("b", 1000, fn);
  const p2 = memo("b", 1000, fn);
  release();
  assert.deepEqual(await Promise.all([p1, p2]), ["v", "v"]);
  assert.equal(calls, 1);
});

test("失敗は保存しない（次の呼び出しで読み直す）", async () => {
  forget();
  let calls = 0;
  const bad = async () => {
    calls += 1;
    throw new Error("x");
  };
  await assert.rejects(memo("c", 1000, bad));
  assert.equal(await memo("c", 1000, async () => "ok"), "ok");
  assert.equal(calls, 1);
});

test("key ごとに分かれる", async () => {
  forget();
  assert.equal(await memo("tag:a", 1000, async () => "A"), "A");
  assert.equal(await memo("tag:b", 1000, async () => "B"), "B");
});
