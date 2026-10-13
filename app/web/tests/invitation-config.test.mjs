// config/invitation の形の確認（Issue #131）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseInvitationConfig } from "../src/lib/invitation-config.ts";

const sample = () => JSON.parse(readFileSync(new URL("../src/config/invitation-sample.json", import.meta.url), "utf8"));

test("見本（invitation-sample.json）は通る", () => {
  const r = parseInvitationConfig(sample());
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.opening.names.kanjiFirst, ["一郎", "花子"]);
  assert.equal(r.value.venueMapUrl, "");
});

test("欠けている・形が違う項目は、項目の名前だけを返す", () => {
  const broken = [
    [(d) => delete d.groom, "groom"],
    [(d) => (d.bride = ""), "bride"],
    [(d) => (d.venueName = 123), "venueName"],
    [(d) => (d.venueAddress = "あ".repeat(201)), "venueAddress"],
    [(d) => (d.venueMapUrl = "javascript:alert(1)"), "venueMapUrl"],
    [(d) => (d.venueMapUrl = "http://example.com/"), "venueMapUrl"],
    [(d) => (d.greeting = []), "greeting"],
    [(d) => (d.greeting = ["ok", 1]), "greeting"],
    [(d) => delete d.opening, "opening"],
    [(d) => (d.opening.date = ""), "opening.date"],
    [(d) => delete d.opening.venue, "opening.venue"],
    [(d) => delete d.opening.names.kataFirst, "opening.names.kataFirst"],
    [(d) => (d.opening.names.latinFull = ["Ichiro Yamada"]), "opening.names.latinFull"],
    [(d) => (d.opening.names.hiraFull = ["やまだ いちろう", ""]), "opening.names.hiraFull"],
  ];
  for (const [mutate, field] of broken) {
    const d = sample();
    mutate(d);
    assert.deepEqual(parseInvitationConfig(d), { ok: false, field }, field);
  }
  assert.deepEqual(parseInvitationConfig(null), { ok: false, field: "(全体)" });
});

test("地図の URL は https だけ通す。余分な項目は捨てる", () => {
  const d = sample();
  d.venueMapUrl = "https://maps.app.goo.gl/example";
  d.extra = "x";
  const r = parseInvitationConfig(d);
  assert.equal(r.ok, true);
  assert.equal(r.value.venueMapUrl, "https://maps.app.goo.gl/example");
  assert.equal("extra" in r.value, false);
});
