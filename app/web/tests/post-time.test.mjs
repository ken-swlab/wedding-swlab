// 投稿・コメントの日時の表示（Issue #301）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { fullDate, relativeTime } from "../src/lib/post-time.ts";

const at = new Date(2026, 10, 15, 18, 25);
const now = at.getTime();

test("ふつうの人：たった今・◯分前・◯時間前・日付と時刻", () => {
  const o = { dateOnly: false, withClock: true };
  assert.equal(relativeTime(at, o, now + 10_000), "たった今");
  assert.equal(relativeTime(at, o, now + 3 * 60_000), "3分前");
  assert.equal(relativeTime(at, o, now + 2 * 3600_000), "2時間前");
  assert.equal(relativeTime(at, o, now + 2 * 86400_000), "11/15 18:25");
  assert.equal(relativeTime(new Date(2026, 0, 2, 9, 5), o, now), "1/2 9:05");
});

test("コメント（時刻なし）：1日を過ぎたら日付だけ", () => {
  assert.equal(relativeTime(at, { dateOnly: false, withClock: false }, now + 2 * 86400_000), "11/15");
});

test("新郎新婦：当日も「◯分前」も出さず、日付だけ", () => {
  const o = { dateOnly: true, withClock: true };
  assert.equal(relativeTime(at, o, now + 10_000), "11/15");
  assert.equal(relativeTime(at, o, now + 3 * 60_000), "11/15");
  assert.equal(relativeTime(at, o, now + 2 * 86400_000), "11/15");
});

test("送信中はそのまま", () => {
  assert.equal(relativeTime(null, { dateOnly: true, withClock: true }), "送信中…");
});

test("拡大表示：新郎新婦は時刻を出さない", () => {
  assert.equal(fullDate(at, true), "11月15日");
  assert.match(fullDate(at, false), /^11月15日 18:25$/);
  assert.equal(fullDate(null, false), "");
});
