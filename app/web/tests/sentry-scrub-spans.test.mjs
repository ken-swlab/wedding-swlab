// Sentry に送るページの読み込みの記録（Web Vitals）から、スパンの URL のクエリを落とす（Issue #250）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { scrubEvent } from "../src/lib/sentry-scrub.ts";

test("スパンの説明と data の URL からクエリを落とす", () => {
  const e = scrubEvent({
    transaction: "/guestbook?q=山田",
    spans: [
      { description: "GET /api/guest/invitation?kind=family", data: { url: "https://example.test/x?name=山田", "http.query": "?name=山田", other: 1 } },
      { description: "resource.img /perf-samples/photo-1.jpg" },
    ],
  });
  assert.equal(e.transaction, "/guestbook");
  assert.equal(e.spans[0].description, "GET /api/guest/invitation");
  assert.equal(e.spans[0].data.url, "https://example.test/x");
  assert.equal("http.query" in e.spans[0].data, false);
  assert.equal(e.spans[0].data.other, 1);
  assert.equal(e.spans[1].description, "resource.img /perf-samples/photo-1.jpg");
});
