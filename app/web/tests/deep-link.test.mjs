// リッチメニューの行き先（Issue #303）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { deepLinkTarget, hasMenuMark, withMenuMark } from "../src/lib/deep-link.ts";

const allowed = (p) => ["/guestbook", "/guide", "/guide/payment"].includes(p);

test("クエリの to（Concatenate）", () => {
  assert.equal(deepLinkTarget("?to=/guide/payment", allowed), "/guide/payment");
  assert.equal(deepLinkTarget("?to=%2Fguide", allowed), "/guide");
  assert.equal(deepLinkTarget("to=/guestbook", allowed), "/guestbook");
});

test("liff.state に入ったクエリ（Replace）", () => {
  assert.equal(deepLinkTarget("?liff.state=%3Fto%3D%2Fguide%2Fpayment", allowed), "/guide/payment");
});

test("liff.state のパス", () => {
  assert.equal(deepLinkTarget("?liff.state=%2Fguide", allowed), "/guide");
  assert.equal(deepLinkTarget("?liff.state=%2Fguide%3Fx%3D1", allowed), "/guide");
});

test("ゲストブック・ご案内の外は受け付けない", () => {
  assert.equal(deepLinkTarget("?to=/admin", allowed), null);
  assert.equal(deepLinkTarget("?liff.state=%2Fadmin", allowed), null);
  assert.equal(deepLinkTarget("?to=/invitation", allowed), null);
});

test("外のサイトへ飛ばす形は断る", () => {
  assert.equal(deepLinkTarget("?to=//evil.example/guide", allowed), null);
  assert.equal(deepLinkTarget("?to=https://evil.example/guide", allowed), null);
  assert.equal(deepLinkTarget("?to=/\\evil.example", allowed), null);
  assert.equal(deepLinkTarget("?liff.state=https%3A%2F%2Fevil.example%2Fguide", allowed), null);
  assert.equal(deepLinkTarget("?to=/guide/../admin", allowed), null);
});

test("無ければ null", () => {
  assert.equal(deepLinkTarget("", allowed), null);
  assert.equal(deepLinkTarget("?x=1", allowed), null);
});

test("印", () => {
  assert.equal(withMenuMark("/guestbook"), "/guestbook?via=menu");
  assert.equal(hasMenuMark("?via=menu"), true);
  assert.equal(hasMenuMark(""), false);
});
