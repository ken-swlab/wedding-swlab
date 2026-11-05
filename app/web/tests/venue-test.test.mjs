// 会場の電波テストの計算（Issue #256）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { VENUE_TEST, fixtureKeys } from "../src/config/venue-test.ts";
import { capacity, jitter, mbps, median, summarizeLive, summarizeUserAgent, toCsv, verdictOf } from "../src/lib/venue-test.ts";

test("中央値・ジッター・Mbps", () => {
  assert.equal(median([30, 10, 20]), 20);
  assert.equal(median([10, 20, 30, 40]), 25);
  assert.equal(median([]), null);
  assert.equal(jitter([10, 20, 15]), 7.5);
  assert.equal(jitter([10]), null);
  assert.equal(mbps(1_000_000, 1000), 8);
  assert.equal(mbps(1_000_000, 0), null);
});

test("足りる人数の目安と判定（下り 110Mbps・上り 14Mbps の例）", () => {
  // 見る: 110 ÷ (2.7 × 0.4) = 101.8 人、送る: 14 ÷ (1.6 × 0.2) = 43.75 人 → 少ないほうの 43 人
  const people = capacity({ downMbps: 110, upMbps: 14 }, VENUE_TEST);
  assert.equal(people, 43);
  assert.equal(verdictOf(people, VENUE_TEST), "tight"); // 70 人の想定に足りない
  assert.equal(verdictOf(80, VENUE_TEST), "caution");
  assert.equal(verdictOf(105, VENUE_TEST), "roomy");
  assert.equal(verdictOf(null, VENUE_TEST), "unknown");
  // 片方しか測れなかったときは、測れたほうだけで決める
  assert.equal(capacity({ downMbps: 110, upMbps: null }, VENUE_TEST), 101);
  assert.equal(capacity({ downMbps: null, upMbps: null }, VENUE_TEST), null);
});

test("端末の種類の要約（そのままの文字列は残さない）", () => {
  assert.equal(summarizeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0"), "iPhone・LINE");
  assert.equal(summarizeUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"), "Android・Chrome");
  assert.equal(summarizeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "iPhone・Safari");
  assert.equal(summarizeUserAgent(""), "不明・その他");
});

const row = (over) => ({
  id: "x", createdAtMs: Date.UTC(2026, 10, 5, 3, 0, 0), place: "窓側", carrier: "docomo", memo: "", device: "iPhone・LINE", liveId: null,
  metrics: { pingMedianMs: 40, pingJitterMs: 5, pingFailed: 0, feedScreenSec: 1.2, downMbps: 100, upMbps: 10, uploadSecPerPhoto: 0.8, firestoreMs: 120 },
  people: 31, verdict: "tight", ...over,
});

test("同時測定の回ごとのまとめ", () => {
  const rows = [
    row({ id: "a", liveId: "L1", metrics: { ...row({}).metrics, downMbps: 40, upMbps: 6 } }),
    row({ id: "b", liveId: "L1", metrics: { ...row({}).metrics, downMbps: 50, upMbps: null } }),
    row({ id: "c" }),
  ];
  const [s] = summarizeLive(rows);
  assert.equal(s.devices, 2);
  assert.equal(s.perDeviceDown, 45);
  assert.equal(s.totalDown, 90);
  assert.equal(s.perDeviceUp, 6);
  assert.equal(summarizeLive([row({})]).length, 0);
});

test("CSV（式に見える自由入力を無害にする）", () => {
  const csv = toCsv([row({ memo: "=HYPERLINK(\"x\")", place: "高砂の前, 右" })]);
  const [head, line] = csv.split("\r\n");
  assert.match(head, /^日時,場所,携帯会社/);
  assert.match(line, /"高砂の前, 右"/);
  assert.match(line, /"'=HYPERLINK\(""x""\)"/);
  assert.match(line, /2026-11-05 12:00:00/);
});

test("テスト用の写真のファイル名", () => {
  const k = fixtureKeys();
  assert.equal(k.feed.length, 10);
  assert.equal(k.feed[0], "test/venue/fixtures/feed-01.jpg");
  assert.equal(k.big[2], "test/venue/fixtures/big-03.jpg");
});
