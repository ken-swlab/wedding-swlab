"use client";

import { useState } from "react";
import { postJson } from "@/lib/api-client";

/**
 * 公式 LINE の通知の再送（Issue #168）。アウトボックスの送信待ちを、サーバーから送る（/api/admin/notify/retry）。
 * ★失敗した通知は、先に scripts/ops.mjs notify retry で送信待ちに戻す★ このボタンは送信待ちを送るだけ。
 * 再送しても、同じ通知が重複して届くことはない（retryKey）。
 */
export function LineNotifyRetry() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const r = await postJson<{ sent: number; failed: number; skipped: number }>("/api/admin/notify/retry", {});
      setResult(r.sent + r.failed + r.skipped === 0 ? "送信待ちの通知はありません" : `送信 ${r.sent} 件・失敗 ${r.failed} 件・送らず ${r.skipped} 件`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "再送できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-4 text-sm shadow-sm">
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="min-h-11 touch-manipulation rounded-full bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
      >
        {busy ? "送信中…" : "送信待ちの通知を送る"}
      </button>
      {result && <p className="mt-2 text-xs text-stone-600">{result}</p>}
      {error && <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
