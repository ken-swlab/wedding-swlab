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

test("2次会の会場（afterParty）は任意。会場名は必須、住所と地図は省略できる。地図は https だけ", () => {
  const r = parseInvitationConfig(sample());
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.afterParty, { venueName: "（ダミー）2次会の会場名", venueAddress: "（ダミー）2次会の住所", venueMapUrl: "" });

  const none = sample();
  delete none.afterParty;
  assert.equal("afterParty" in parseInvitationConfig(none).value, false);

  const short = sample();
  short.afterParty = { venueName: "会場", venueMapUrl: "https://maps.app.goo.gl/example" };
  assert.deepEqual(parseInvitationConfig(short).value.afterParty, { venueName: "会場", venueAddress: "", venueMapUrl: "https://maps.app.goo.gl/example" });

  const broken = [
    [(d) => (d.afterParty = "会場"), "afterParty"],
    [(d) => (d.afterParty = null), "afterParty"],
    [(d) => (d.afterParty.venueName = ""), "afterParty.venueName"],
    [(d) => (d.afterParty.venueAddress = "あ".repeat(201)), "afterParty.venueAddress"],
    [(d) => (d.afterParty.venueMapUrl = "javascript:alert(1)"), "afterParty.venueMapUrl"],
    [(d) => (d.afterParty.venueMapUrl = "http://example.com/"), "afterParty.venueMapUrl"],
  ];
  for (const [mutate, field] of broken) {
    const x = sample();
    mutate(x);
    assert.deepEqual(parseInvitationConfig(x), { ok: false, field }, field);
  }
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

test("写真・ふたりから・当日のおたのしみ（Issue #173）は任意。無ければ空で、ご挨拶は出さない", () => {
  const d = sample();
  delete d.photos;
  delete d.fromUs;
  delete d.highlights;
  delete d.showGreeting;
  const r = parseInvitationConfig(d);
  assert.equal(r.ok, true);
  assert.equal("photos" in r.value, false);
  assert.deepEqual(r.value.fromUs, []);
  assert.deepEqual(r.value.highlights, []);
  assert.equal(r.value.showGreeting, false);

  const s = parseInvitationConfig(sample());
  assert.equal(s.ok, true);
  assert.equal(s.value.photos.hero.url, "/placeholders/invitation/hero.svg");
  assert.equal(s.value.fromUs.length, 2);
  assert.deepEqual(s.value.highlights.map((h) => h.key), ["food", "drink", "game"]);

  // 重ねる文字の色（Issue #178）。省略なら黒
  const c = sample();
  delete c.photos.hero.overlayColor;
  assert.equal(parseInvitationConfig(c).value.photos.hero.overlayColor, "black");
  c.photos.hero.overlayColor = "white";
  assert.equal(parseInvitationConfig(c).value.photos.hero.overlayColor, "white");

  const g = sample();
  g.showGreeting = true;
  assert.equal(parseInvitationConfig(g).value.showGreeting, true);
});

test("パスコードのヒントと、何回目から出すかは任意。回数は 1〜4 の整数だけ（Issue #181）", () => {
  const r = parseInvitationConfig(sample());
  assert.equal(r.value.passcodeHint, "宴の日です");
  assert.equal(r.value.passcodeHintFrom, 2);

  const none = sample();
  delete none.passcodeHint;
  delete none.passcodeHintFrom;
  const n = parseInvitationConfig(none);
  assert.equal(n.ok, true);
  assert.equal("passcodeHint" in n.value, false);
  assert.equal("passcodeHintFrom" in n.value, false);

  const empty = sample();
  empty.passcodeHint = "";
  assert.equal("passcodeHint" in parseInvitationConfig(empty).value, false);

  for (const [v, field] of [[0, "passcodeHintFrom"], [5, "passcodeHintFrom"], [1.5, "passcodeHintFrom"], ["2", "passcodeHintFrom"]]) {
    const d = sample();
    d.passcodeHintFrom = v;
    assert.deepEqual(parseInvitationConfig(d), { ok: false, field });
  }
  const long = sample();
  long.passcodeHint = "あ".repeat(201);
  assert.deepEqual(parseInvitationConfig(long), { ok: false, field: "passcodeHint" });
});

test("写真の URL は仮の画像（/placeholders/invitation/）か https だけ。空は未設定。alt は必須（Issue #173）", () => {
  const ok = [
    (d) => (d.photos.hero.url = ""),
    (d) => (d.photos.hero.url = "https://media.example.com/site/invitation/0b6f.jpg"),
    (d) => (d.fromUs[0].photoUrl = ""),
  ];
  for (const mutate of ok) {
    const d = sample();
    mutate(d);
    assert.equal(parseInvitationConfig(d).ok, true);
  }
  const broken = [
    [(d) => (d.photos.hero.url = "http://media.example.com/a.jpg"), "photos.hero.url"],
    [(d) => (d.photos.hero.url = "javascript:alert(1)"), "photos.hero.url"],
    [(d) => (d.photos.hero.url = "/placeholders/../secret.jpg"), "photos.hero.url"],
    [(d) => (d.photos.hero.url = "/uploads/hero.jpg"), "photos.hero.url"],
    [(d) => (d.photos.hero.alt = ""), "photos.hero.alt"],
    [(d) => (d.photos = "x"), "photos"],
    [(d) => (d.photos.hero.overlayColor = "red"), "photos.hero.overlayColor"],
    [(d) => (d.fromUs[1].photoUrl = "data:image/png;base64,AAAA"), "fromUs.1.photoUrl"],
    [(d) => delete d.fromUs[0].alt, "fromUs.0.alt"],
    [(d) => (d.fromUs[0].name = ""), "fromUs.0.name"],
    [(d) => (d.fromUs[1].message = "あ".repeat(201)), "fromUs.1.message"],
    [(d) => d.fromUs.push({ ...d.fromUs[0] }), "fromUs"],
    [(d) => (d.highlights[0].key = "music"), "highlights.0.key"],
    [(d) => (d.highlights[2].body = ""), "highlights.2.body"],
    [(d) => (d.showGreeting = "yes"), "showGreeting"],
  ];
  for (const [mutate, field] of broken) {
    const d = sample();
    mutate(d);
    assert.deepEqual(parseInvitationConfig(d), { ok: false, field }, field);
  }
});
