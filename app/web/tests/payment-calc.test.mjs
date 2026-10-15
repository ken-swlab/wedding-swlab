// 会費の内訳の計算と config/payment の形（Issue #148）。実行: cd app/web && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentBreakdown } from "../src/lib/payment-calc.ts";
import { parsePaymentConfig } from "../src/lib/payment-config.ts";

const config = { partyYen: 20000, secondYen: 5000, carFareYen: 10000 };

test("出欠4通り × お車代2通り", () => {
  const cases = [
    ["both", false, [["会食", 20000], ["2次会", 5000]], 25000],
    ["both", true, [["会食", 20000], ["2次会", 5000], ["お車代", -10000]], 15000],
    ["first_only", false, [["会食", 20000]], 20000],
    ["first_only", true, [["会食", 20000], ["お車代", -10000]], 10000],
    ["second_only", false, [["2次会", 5000]], 5000],
    ["second_only", true, [["2次会", 5000], ["お車代", -10000]], 0],
    ["declined", false, [], 0],
    ["declined", true, [], 0],
  ];
  for (const [attendance, carFare, items, total] of cases) {
    const r = paymentBreakdown(config, attendance, carFare);
    assert.deepEqual(r.items.map((i) => [i.label, i.yen]), items, `${attendance} ${carFare}`);
    assert.equal(r.totalYen, total, `${attendance} ${carFare}`);
  }
});

test("合計は 0 円未満にならない", () => {
  for (const attendance of ["both", "first_only", "second_only", "declined", "unanswered"]) {
    const r = paymentBreakdown({ partyYen: 1000, secondYen: 1000, carFareYen: 50000 }, attendance, true);
    assert.ok(r.totalYen >= 0, attendance);
  }
});

test("未回答は 0 円。お車代が 0 円なら行を出さない", () => {
  assert.deepEqual(paymentBreakdown(config, "unanswered", true), { items: [], totalYen: 0 });
  const r = paymentBreakdown({ ...config, carFareYen: 0 }, "both", true);
  assert.deepEqual(r.items.map((i) => i.label), ["会食", "2次会"]);
});

test("config/payment の形", () => {
  assert.deepEqual(parsePaymentConfig({ ...config, extra: 1 }), { ok: true, value: config });
  assert.deepEqual(parsePaymentConfig(null), { ok: false, field: "(全体)" });
  assert.deepEqual(parsePaymentConfig({ ...config, partyYen: "20000" }), { ok: false, field: "partyYen" });
  assert.deepEqual(parsePaymentConfig({ ...config, secondYen: -1 }), { ok: false, field: "secondYen" });
  assert.deepEqual(parsePaymentConfig({ ...config, carFareYen: 1.5 }), { ok: false, field: "carFareYen" });
  assert.deepEqual(parsePaymentConfig({ partyYen: 1, secondYen: 1 }), { ok: false, field: "carFareYen" });
});
