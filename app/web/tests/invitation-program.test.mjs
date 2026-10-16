// 当日の流れから画面の文字を組み立てる（Issue #166）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { ceremonyChoiceNote, programTime, shortDateLabel, weekdayOf } from "../src/lib/invitation-program.ts";

const program = [
  { time: "11:30", title: "集合", note: "", highlight: false, role: "gather" },
  { time: "11:45", title: "挙式", note: "", highlight: true, role: "ceremony" },
  { time: "12:15", title: "受付", note: "", highlight: false, role: "reception" },
  { time: "12:45", title: "披露宴", note: "", highlight: true, role: "party" },
  { time: "", title: "2次会", note: "", highlight: false },
];

test("時刻が未定の行は --:--", () => {
  assert.equal(programTime({ time: "" }), "--:--");
  assert.equal(programTime({ time: "9:30" }), "9:30");
});

test("挙式の選択肢の時刻は、役目（role）の付いた行から組み立てる", () => {
  assert.equal(ceremonyChoiceNote(program, "ceremony"), "11:30 集合 ／ 11:45 開始（任意参加）");
  assert.equal(ceremonyChoiceNote(program, "party"), "12:15 受付 ／ 12:45 開始");
  // 役目の行が無い・時刻が未定なら、その部分を出さない
  const noGather = program.filter((r) => r.role !== "gather");
  assert.equal(ceremonyChoiceNote(noGather, "ceremony"), "11:45 開始（任意参加）");
  const tbd = program.map((r) => (r.role === "party" ? { ...r, time: "" } : r));
  assert.equal(ceremonyChoiceNote(tbd, "party"), "12:15 受付");
  assert.equal(ceremonyChoiceNote([], "party"), "");
});

test("曜日と短い日付。日付として読めなければ曜日を出さない", () => {
  assert.equal(weekdayOf("2030.1.5"), "SAT");
  assert.equal(weekdayOf("2030.01.05"), "SAT");
  assert.equal(shortDateLabel("2030.01.05"), "1.5 SAT");
  assert.equal(weekdayOf("20XX.XX.XX"), "");
  assert.equal(shortDateLabel("20XX.XX.XX"), "20XX.XX.XX");
  assert.equal(weekdayOf("2030.2.30"), "");
});
