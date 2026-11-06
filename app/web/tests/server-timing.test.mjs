// API の Server-Timing ヘッダ（Issue #277）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServerTiming } from "../src/lib/server-timing.ts";

test("同時に走らせた処理も、それぞれの時間を測る。最後に total", async () => {
  let t = 0;
  const timing = createServerTiming(() => t);
  let done1;
  let done2;
  const p1 = timing.time("line_verify", new Promise((r) => (done1 = r)));
  const p2 = timing.time("firebase_read", new Promise((r) => (done2 = r)));
  t = 30;
  done2("b");
  await p2;
  t = 80;
  done1("a");
  assert.equal(await p1, "a");
  t = 90;
  assert.equal(timing.header(), "firebase_read;dur=30.0, line_verify;dur=80.0, total;dur=90.0");
});

test("失敗しても測ってから投げ直す。名前の変な文字は _ にする", async () => {
  let t = 0;
  const timing = createServerTiming(() => t);
  t = 5;
  await assert.rejects(timing.time("db read!", Promise.reject(new Error("x"))));
  assert.match(timing.header(), /^db_read_;dur=0\.0, total;dur=5\.0$/);
});
