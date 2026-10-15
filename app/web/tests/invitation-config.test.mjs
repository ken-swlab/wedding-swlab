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

test("挙式（ceremony）は任意。あるときは時刻の形を確かめる（Issue #146）", () => {
  const ok = sample();
  assert.deepEqual(parseInvitationConfig(ok).value.ceremony, ok.ceremony);

  const none = sample();
  delete none.ceremony;
  const r = parseInvitationConfig(none);
  assert.equal(r.ok, true);
  assert.equal("ceremony" in r.value, false);

  const noGather = sample();
  noGather.ceremony = { startAt: "9:30" };
  assert.deepEqual(parseInvitationConfig(noGather).value.ceremony, { startAt: "9:30", gatherAt: "", note: "" });

  const broken = [
    [(d) => (d.ceremony = null), "ceremony"],
    [(d) => (d.ceremony = "15:15"), "ceremony"],
    [(d) => delete d.ceremony.startAt, "ceremony.startAt"],
    [(d) => (d.ceremony.startAt = "25:00"), "ceremony.startAt"],
    [(d) => (d.ceremony.startAt = "15時15分"), "ceremony.startAt"],
    [(d) => (d.ceremony.gatherAt = "3pm"), "ceremony.gatherAt"],
    [(d) => (d.ceremony.note = 1), "ceremony.note"],
    [(d) => (d.ceremony.note = "あ".repeat(201)), "ceremony.note"],
  ];
  for (const [mutate, field] of broken) {
    const d = sample();
    mutate(d);
    assert.deepEqual(parseInvitationConfig(d), { ok: false, field }, field);
  }
});
