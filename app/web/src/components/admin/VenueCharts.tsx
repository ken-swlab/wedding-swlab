"use client";

import { VERDICT_LABEL, type Verdict } from "@/lib/venue-test";

/**
 * 会場の電波テストのグラフ（Issue #256。管理画面だけ）。ライブラリを足さず SVG で描く。
 * ★1つのグラフに1つの量★（下りと上りは桁が違うので、別のグラフに分ける。軸を2つにしない）
 * ★判定の色は状態の色★（余裕＝灰・注意＝黄・厳しい＝赤）。色だけに頼らず、棒の横に判定の言葉も出す。
 * 値は棒・点の上にカーソルを置くと出る（SVG の title）。表（ダッシュボードの一覧）が同じ数字の表の見方になる。
 */

const VERDICT_FILL: Record<Verdict, string> = {
  roomy: "fill-stone-400",
  caution: "fill-amber-400",
  tight: "fill-rose-500",
  unknown: "fill-stone-200",
};

export type PlaceBar = { label: string; value: number | null; verdict: Verdict; count: number };

/** 場所ごとの横棒（下り・上りのどちらか1つ） */
export function PlaceBarChart({ title, unit, bars }: { title: string; unit: string; bars: PlaceBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value ?? 0));
  const row = 32;
  const labelW = 84;
  const valueW = 92;
  const width = 340;
  const plotW = width - labelW - valueW;
  const height = bars.length * row + 8;
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-xs font-semibold text-stone-700">{title}</figcaption>
      {bars.length === 0 ? (
        <p className="py-4 text-xs text-stone-400">この日の測定はまだありません。</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${title}（場所ごと）`}>
          {bars.map((b, i) => {
            const y = 4 + i * row;
            const w = b.value != null ? Math.max(4, (b.value / max) * plotW) : 0;
            return (
              <g key={b.label}>
                <title>{`${b.label}: ${b.value != null ? `${b.value.toFixed(1)} ${unit}` : "測れず"}（${VERDICT_LABEL[b.verdict]}・${b.count} 回の平均）`}</title>
                <text x={labelW - 6} y={y + row / 2} textAnchor="end" dominantBaseline="middle" className="fill-stone-700 text-[11px]">
                  {b.label.length > 7 ? `${b.label.slice(0, 7)}…` : b.label}
                </text>
                {/* 背景の帯（当たり判定を棒より大きくする） */}
                <rect x={labelW} y={y + 4} width={plotW} height={row - 8} className="fill-stone-100" rx={4} />
                {w > 0 && <rect x={labelW} y={y + 8} width={w} height={row - 16} rx={4} className={VERDICT_FILL[b.verdict]} />}
                <text x={labelW + plotW + 6} y={y + row / 2} dominantBaseline="middle" className="fill-stone-700 text-[11px] tabular-nums">
                  {b.value != null ? `${b.value.toFixed(1)}` : "—"}
                  <tspan className="fill-stone-500">{` ${VERDICT_LABEL[b.verdict]}`}</tspan>
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </figure>
  );
}

export type LinePoint = { devices: number; value: number };

/** 同時測定: 台数（横）と1台あたりの速さ（縦）。1本の線だけ（凡例は要らない。題名が名前） */
export function DevicesLineChart({ title, unit, points }: { title: string; unit: string; points: LinePoint[] }) {
  const width = 340;
  const height = 180;
  const pad = { l: 36, r: 16, t: 12, b: 28 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const maxX = Math.max(2, ...points.map((p) => p.devices));
  const maxY = Math.max(1, ...points.map((p) => p.value)) * 1.1;
  const x = (d: number) => pad.l + ((d - 1) / (maxX - 1)) * plotW;
  const y = (v: number) => pad.t + plotH - (v / maxY) * plotH;
  const sorted = [...points].sort((a, b) => a.devices - b.devices);
  const ticks = Array.from({ length: maxX }, (_, i) => i + 1);
  const last = sorted[sorted.length - 1];
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-xs font-semibold text-stone-700">{title}</figcaption>
      {sorted.length < 2 ? (
        <p className="py-4 text-xs text-stone-400">1台の測定と同時測定がそろうと、台数ごとの落ち方が出ます。</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${title}（台数ごと）`}>
          {/* 目盛り（控えめ） */}
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={pad.l} x2={width - pad.r} y1={y(maxY * f)} y2={y(maxY * f)} className="stroke-stone-200" strokeWidth={1} />
              <text x={pad.l - 4} y={y(maxY * f)} textAnchor="end" dominantBaseline="middle" className="fill-stone-400 text-[10px] tabular-nums">
                {Math.round(maxY * f)}
              </text>
            </g>
          ))}
          {ticks.map((d) => (
            <text key={d} x={x(d)} y={height - 8} textAnchor="middle" className="fill-stone-500 text-[10px] tabular-nums">
              {d}台
            </text>
          ))}
          <polyline
            points={sorted.map((p) => `${x(p.devices)},${y(p.value)}`).join(" ")}
            className="fill-none stroke-stone-700"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {sorted.map((p) => (
            <g key={p.devices}>
              <title>{`${p.devices}台: 1台あたり ${p.value.toFixed(1)} ${unit}`}</title>
              {/* 当たり判定は点より大きく */}
              <circle cx={x(p.devices)} cy={y(p.value)} r={12} className="fill-transparent" />
              <circle cx={x(p.devices)} cy={y(p.value)} r={4} className="fill-stone-700 stroke-white" strokeWidth={2} />
            </g>
          ))}
          {/* 数字は最後の点にだけ */}
          <text x={x(last.devices)} y={y(last.value) - 10} textAnchor="end" className="fill-stone-700 text-[11px] tabular-nums">
            {`${last.value.toFixed(1)} ${unit}`}
          </text>
        </svg>
      )}
    </figure>
  );
}
