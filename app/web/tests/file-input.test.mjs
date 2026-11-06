// ファイルの入力欄から取り出す順番（Issue #278）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { takeFiles } from "../src/lib/file-input.ts";

/** 入力欄の見立て: value を "" にすると files の中身も空になる（ブラウザの FileList と同じ） */
function fakeInput(names) {
  const files = names.map((name) => ({ name }));
  const input = {
    files,
    get value() {
      return files.length ? "C:\\fakepath\\" + files[0].name : "";
    },
    set value(v) {
      if (v === "") files.length = 0;
    },
  };
  return input;
}

test("空にする前に取り出す（空にしても取り出したファイルは残る）", () => {
  const input = fakeInput(["a.jpg", "b.jpg"]);
  const got = takeFiles(input.files, input);
  assert.deepEqual(got.map((f) => f.name), ["a.jpg", "b.jpg"]);
  assert.equal(input.files.length, 0);
  assert.equal(input.value, "");
});

test("見立てが正しいこと: 先に空にすると0件になる（#276 の不具合の再現）", () => {
  const input = fakeInput(["a.jpg"]);
  input.value = "";
  assert.equal(Array.from(input.files).length, 0);
});

test("files が無いときは空の配列", () => {
  assert.deepEqual(takeFiles(null, { value: "x" }), []);
  assert.deepEqual(takeFiles(undefined, null), []);
});
