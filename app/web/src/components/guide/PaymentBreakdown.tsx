"use client";

import type { PaymentStatusResponse } from "@/types/payment";

const yen = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("ja-JP")}円`;

/**
 * 会費の内訳と合計（Issue #148）。値は GET /api/guest/payment（本人の分だけ）から受け取る。
 * 計算はサーバー（lib/payment-calc.ts）。ここは並べて出すだけ。
 */
export function PaymentBreakdown({ data }: { data: PaymentStatusResponse }) {
  if (!data.configured) {
    return (
      <section className="rounded-2xl border border-stone-200/80 bg-white p-4 text-center text-sm text-stone-500 shadow-sm">
        会費の金額は準備中です。
      </section>
    );
  }
  return (
    <section aria-label="会費の内訳" className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <p className="text-xs text-stone-500">あなたの会費</p>
      {data.items.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">ご出席の回答がないため、会費はありません。</p>
      ) : (
        <dl className="mt-3 space-y-2 text-sm text-stone-700">
          {data.items.map((i) => (
            <div key={i.label} className="flex items-baseline justify-between">
              <dt>{i.label}</dt>
              <dd className="tabular-nums">{yen(i.yen)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-3 flex items-baseline justify-between border-t border-stone-200 pt-3">
        <p className="text-sm font-medium text-stone-800">合計</p>
        <p className="font-serif text-2xl tabular-nums tracking-wide text-stone-900">{yen(data.totalYen)}</p>
      </div>
    </section>
  );
}
