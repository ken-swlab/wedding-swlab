"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { deleteJson } from "@/lib/api-client";
import { VENUE_TEST } from "@/config/venue-test";
import {
  VERDICT_LABEL, capacity, jstDate, mean, summarizeLive, toCsv, verdictOf,
  type VenueMetrics, type VenueResultRow, type Verdict,
} from "@/lib/venue-test";
import { DevicesLineChart, PlaceBarChart, type LinePoint, type PlaceBar } from "./VenueCharts";

const VERDICTS: Verdict[] = ["roomy", "caution", "tight", "unknown"];
const VERDICT_TEXT: Record<Verdict, string> = {
  roomy: "text-stone-600",
  caution: "text-amber-700",
  tight: "text-rose-700",
  unknown: "text-stone-400",
};

function toRow(id: string, d: DocumentData): VenueResultRow | null {
  const at = d.createdAt;
  if (!at || typeof at.toMillis !== "function") return null; // 書き込み中（サーバー時刻が未確定）は出さない
  const m = (d.metrics ?? {}) as Partial<VenueMetrics>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    id,
    createdAtMs: at.toMillis(),
    place: typeof d.place === "string" ? d.place : "",
    carrier: typeof d.carrier === "string" ? d.carrier : "",
    memo: typeof d.memo === "string" ? d.memo : "",
    device: typeof d.device === "string" ? d.device : "",
    liveId: typeof d.liveId === "string" ? d.liveId : null,
    metrics: {
      pingMedianMs: n(m.pingMedianMs), pingJitterMs: n(m.pingJitterMs), pingFailed: n(m.pingFailed) ?? 0,
      feedScreenSec: n(m.feedScreenSec), downMbps: n(m.downMbps), upMbps: n(m.upMbps),
      uploadSecPerPhoto: n(m.uploadSecPerPhoto), firestoreMs: n(m.firestoreMs),
    },
    people: n(d.people),
    verdict: VERDICTS.includes(d.verdict) ? d.verdict : "unknown",
  };
}

const fmt = (v: number | null, digits = 1) => (v == null ? "—" : v.toFixed(digits));
const time = (ms: number) => new Date(ms).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });

/**
 * 会場の電波テストのダッシュボード（Issue #256）。これまでの測定を 日付 → 場所 → 携帯会社 でまとめる。
 * 読むのは管理者だけ（Rules）。消すのは /api/admin/venue-test/results（監査ログに残る）。
 * ★場所ごとの比較と、台数ごとの落ち方は、選んだ日の測定だけで出す★（日が違うと混み具合が違い、比べられない）
 */
export function VenueTestDashboard() {
  const [rows, setRows] = useState<VenueResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<string>("");

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "venueTests"), orderBy("createdAt", "desc"), limit(VENUE_TEST.listLimit)),
        (snap) => setRows(snap.docs.flatMap((d) => toRow(d.id, d.data()) ?? [])),
        (e) => {
          console.error("[venue-test] 結果を読めませんでした", e);
          setError("結果を読めませんでした");
          setRows([]);
        },
      ),
    [],
  );

  const days = useMemo(() => [...new Set((rows ?? []).map((r) => jstDate(r.createdAtMs)))], [rows]);
  const selected = day && days.includes(day) ? day : (days[0] ?? "");
  const dayRows = useMemo(() => (rows ?? []).filter((r) => jstDate(r.createdAtMs) === selected), [rows, selected]);

  // 一覧: 場所 → 携帯会社 → 時刻
  const grouped = useMemo(
    () => [...dayRows].sort((a, b) => a.place.localeCompare(b.place, "ja") || a.carrier.localeCompare(b.carrier) || a.createdAtMs - b.createdAtMs),
    [dayRows],
  );

  // 場所ごとの比較（1台で測った回だけ。同時測定の回は1台あたりが下がるので混ぜない）
  const placeBars = useMemo(() => {
    const solo = dayRows.filter((r) => !r.liveId);
    const places = [...new Set(solo.map((r) => r.place))];
    const make = (pick: (m: VenueMetrics) => number | null): PlaceBar[] =>
      places.map((place) => {
        const rs = solo.filter((r) => r.place === place);
        const down = mean(rs.map((r) => r.metrics.downMbps));
        const up = mean(rs.map((r) => r.metrics.upMbps));
        const verdict = verdictOf(capacity({ downMbps: down, upMbps: up }, VENUE_TEST), VENUE_TEST);
        return { label: place, value: mean(rs.map((r) => pick(r.metrics))), verdict, count: rs.length };
      });
    return { down: make((m) => m.downMbps), up: make((m) => m.upMbps) };
  }, [dayRows]);

  // 台数ごとの1台あたりの速さ（1台 = 1台で測った回の平均、2台以上 = 同時測定の回の平均）
  const linePoints = useMemo(() => {
    const solo = dayRows.filter((r) => !r.liveId);
    const lives = summarizeLive(dayRows);
    const build = (soloV: number | null, pick: (s: (typeof lives)[number]) => number | null): LinePoint[] => {
      const by = new Map<number, number[]>();
      if (soloV != null) by.set(1, [soloV]);
      for (const s of lives) {
        const v = pick(s);
        if (v != null) by.set(s.devices, [...(by.get(s.devices) ?? []), v]);
      }
      return [...by].map(([devices, vs]) => ({ devices, value: vs.reduce((a, b) => a + b, 0) / vs.length }));
    };
    return {
      down: build(mean(solo.map((r) => r.metrics.downMbps)), (s) => s.perDeviceDown),
      up: build(mean(solo.map((r) => r.metrics.upMbps)), (s) => s.perDeviceUp),
      lives,
    };
  }, [dayRows]);

  async function remove(id: string) {
    if (!confirm("この測定を削除しますか？（元に戻せません）")) return;
    try {
      await deleteJson("/api/admin/venue-test/results", { id });
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除できませんでした");
    }
  }

  function downloadCsv() {
    // Excel で文字化けしないよう、先頭に BOM を付ける
    const blob = new Blob(["﻿", toCsv(grouped)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `venue-test-${selected || "all"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (rows === null) return <div className="h-40 animate-pulse rounded-2xl bg-stone-200/60" />;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-serif text-lg text-stone-900">これまでの測定</h2>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-stone-500" htmlFor="venue-day">日付</label>
          <select
            id="venue-day"
            value={selected}
            onChange={(e) => setDay(e.target.value)}
            className="min-h-11 rounded-full border border-stone-200 bg-white px-3 text-sm"
          >
            {days.length === 0 && <option value="">（まだありません）</option>}
            {days.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={grouped.length === 0}
            className="min-h-11 touch-manipulation rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-40"
          >
            CSV
          </button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      {/* 場所ごとの比較 */}
      <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs leading-relaxed text-stone-500">
          場所ごとの比較（{selected || "—"}・1台で測った回の平均）。棒の色は判定（灰＝余裕・黄＝注意・赤＝厳しい）。
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <PlaceBarChart title="下り（Mbps）" unit="Mbps" bars={placeBars.down} />
          <PlaceBarChart title="上り（Mbps）" unit="Mbps" bars={placeBars.up} />
        </div>
      </div>

      {/* 同時測定 */}
      <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs leading-relaxed text-stone-500">
          同時測定（{selected || "—"}）。台数が増えると、1台あたりの速さがどれだけ落ちるか。
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <DevicesLineChart title="1台あたりの下り（Mbps）" unit="Mbps" points={linePoints.down} />
          <DevicesLineChart title="1台あたりの上り（Mbps）" unit="Mbps" points={linePoints.up} />
        </div>
        {linePoints.lives.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-stone-600">
            {linePoints.lives.map((s) => (
              <li key={s.liveId} className="tabular-nums">
                {time(s.atMs)}・{s.devices}台: 合計 下り {fmt(s.totalDown)} / 上り {fmt(s.totalUp)} Mbps（1台あたり {fmt(s.perDeviceDown)} / {fmt(s.perDeviceUp)}）
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 一覧（場所 → 携帯会社 → 時刻）。横に長いので、この箱の中だけ横にスクロールする */}
      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        <table className="min-w-[760px] w-full text-left text-xs">
          <thead className="bg-stone-100 text-stone-600">
            <tr>
              {["場所", "携帯会社", "時刻", "反応(ms)", "下り", "上り", "1画面(秒)", "1枚送信(秒)", "判定", ""].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-stone-400">この日の測定はまだありません。</td></tr>
            )}
            {grouped.map((r) => (
              <tr key={r.id} className="border-t border-stone-100 align-top">
                <td className="px-3 py-2 text-stone-800">
                  {r.place}
                  {r.liveId && <span className="ml-1 rounded bg-sky-50 px-1 text-[10px] text-sky-700">同時</span>}
                  {r.memo && <div className="mt-0.5 text-[11px] text-stone-400">{r.memo}</div>}
                </td>
                <td className="px-3 py-2">{r.carrier}<div className="text-[11px] text-stone-400">{r.device}</div></td>
                <td className="px-3 py-2 tabular-nums">{time(r.createdAtMs)}</td>
                <td className="px-3 py-2 tabular-nums">{fmt(r.metrics.pingMedianMs, 0)}{r.metrics.pingFailed > 0 && <span className="text-rose-600">（失敗 {r.metrics.pingFailed}）</span>}</td>
                <td className="px-3 py-2 tabular-nums">{fmt(r.metrics.downMbps)}</td>
                <td className="px-3 py-2 tabular-nums">{fmt(r.metrics.upMbps)}</td>
                <td className="px-3 py-2 tabular-nums">{fmt(r.metrics.feedScreenSec, 2)}</td>
                <td className="px-3 py-2 tabular-nums">{fmt(r.metrics.uploadSecPerPhoto, 2)}</td>
                <td className={`whitespace-nowrap px-3 py-2 font-semibold ${VERDICT_TEXT[r.verdict]}`}>
                  {VERDICT_LABEL[r.verdict]}{r.people != null && <span className="font-normal text-stone-500">（約 {r.people} 人）</span>}
                </td>
                <td className="px-2 py-1">
                  <button type="button" onClick={() => void remove(r.id)} className="min-h-11 touch-manipulation rounded-full px-3 text-rose-600 hover:bg-rose-50">
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
