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

test("当日の流れ（program）は1行以上。時刻は HH:MM か空（Issue #166）", () => {
  const r = parseInvitationConfig(sample());
  assert.equal(r.ok, true);
  assert.equal(r.value.program.length, 5);
  assert.deepEqual(r.value.program[4], { time: "", title: "2次会", note: "詳細は後日", highlight: false });
  assert.equal(r.value.program[1].role, "ceremony");

  // note・highlight は省略できる
  const d = sample();
  d.program = [{ time: "9:30", title: "受付" }];
  assert.deepEqual(parseInvitationConfig(d).value.program, [{ time: "9:30", title: "受付", note: "", highlight: false }]);

  const broken = [
    [(d) => delete d.program, "program"],
    [(d) => (d.program = []), "program"],
    [(d) => (d.program = Array.from({ length: 13 }, () => ({ time: "", title: "x" }))), "program"],
    [(d) => (d.program[0] = "15:00 集合"), "program.0"],
    [(d) => (d.program[1].time = "25:00"), "program.1.time"],
    [(d) => (d.program[1].time = "3pm"), "program.1.time"],
    [(d) => (d.program[2].title = ""), "program.2.title"],
    [(d) => (d.program[2].note = 1), "program.2.note"],
    [(d) => (d.program[3].highlight = "true"), "program.3.highlight"],
    [(d) => (d.program[4].role = "afterParty"), "program.4.role"],
    // 同じ役目は1行だけ
    [(d) => (d.program[4].role = "party"), "program.4.role"],
  ];
  for (const [mutate, field] of broken) {
    const x = sample();
    mutate(x);
    assert.deepEqual(parseInvitationConfig(x), { ok: false, field }, field);
  }
});

test("以前の receptionAt・ceremony は残っていても読まない（Issue #166 で program に移した）", () => {
  const d = sample();
  d.receptionAt = "受付 XX:XX";
  d.ceremony = { startAt: "12:00" };
  const r = parseInvitationConfig(d);
  assert.equal(r.ok, true);
  assert.equal("receptionAt" in r.value, false);
  assert.equal("ceremony" in r.value, false);
});

test("承認の目安（approvalNote）は任意。文字列で 200 文字まで（Issue #157 B-4）", () => {
  const ok = sample();
  assert.equal(parseInvitationConfig(ok).value.approvalNote, ok.approvalNote);

  for (const empty of [undefined, ""]) {
    const d = sample();
    d.approvalNote = empty;
    const r = parseInvitationConfig(d);
    assert.equal(r.ok, true);
    assert.equal("approvalNote" in r.value, false);
  }

  for (const bad of [1, ["x"], "あ".repeat(201)]) {
    const d = sample();
    d.approvalNote = bad;
    assert.deepEqual(parseInvitationConfig(d), { ok: false, field: "approvalNote" });
  }
});
