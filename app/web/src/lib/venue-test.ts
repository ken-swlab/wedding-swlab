/**
 * 会場の電波テスト（Issue #256）の計算。測定（lib/venue-measure.ts）・API・ダッシュボードが同じものを使う。
 * ★このファイルは何も import しない★（tests/ が Node でそのまま読み込む）。設定は呼び出し側が渡す（config/venue-test.ts）。
 */

export type VenueMetrics = {
  /** 1. 反応の速さ（/api/health） */
  pingMedianMs: number | null;
  pingJitterMs: number | null;
  pingFailed: number;
  /** 2. タイムライン1画面（feed 相当 10 枚を同時に）の秒数・下りの速さ */
  feedScreenSec: number | null;
  downMbps: number | null;
  /** 3. 上りの速さ・写真1枚あたりの秒数 */
  upMbps: number | null;
  uploadSecPerPhoto: number | null;
  /** 4. Firestore に書いて読み直すまで（中央値） */
  firestoreMs: number | null;
};

export type Verdict = "roomy" | "caution" | "tight" | "unknown";
export const VERDICT_LABEL: Record<Verdict, string> = { roomy: "余裕", caution: "注意", tight: "厳しい", unknown: "測れず" };

type CapacityConfig = {
  expectedGuests: number;
  perPerson: { viewMbps: number; sendMbps: number };
  concurrency: { view: number; send: number };
  verdict: { roomy: number; caution: number };
};

export function median(values: readonly number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** ばらつき（ジッター）: 続けて測った値の差の平均 */
export function jitter(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < values.length; i++) sum += Math.abs(values[i] - values[i - 1]);
  return sum / (values.length - 1);
}

/** バイト数とミリ秒から Mbps */
export function mbps(bytes: number, ms: number): number | null {
  if (!(ms > 0) || !(bytes > 0)) return null;
  return (bytes * 8) / (ms / 1000) / 1_000_000;
}

/**
 * この速さを何人で分けても足りるか（1台で測った目安）。
 * 見る人の分（下り）と送る人の分（上り）の、少ないほうで決まる。測れなかった側は数えない。両方とも無ければ null。
 */
export function capacity(m: Pick<VenueMetrics, "downMbps" | "upMbps">, cfg: CapacityConfig): number | null {
  const view = m.downMbps != null ? m.downMbps / (cfg.perPerson.viewMbps * cfg.concurrency.view) : null;
  const send = m.upMbps != null ? m.upMbps / (cfg.perPerson.sendMbps * cfg.concurrency.send) : null;
  const xs = [view, send].filter((x): x is number => x != null && Number.isFinite(x));
  if (xs.length === 0) return null;
  return Math.floor(Math.min(...xs));
}

export function verdictOf(people: number | null, cfg: CapacityConfig): Verdict {
  if (people == null) return "unknown";
  const r = people / cfg.expectedGuests;
  if (r >= cfg.verdict.roomy) return "roomy";
  if (r >= cfg.verdict.caution) return "caution";
  return "tight";
}

/**
 * 端末の種類（ユーザーエージェントの要約）。保存するのはこれだけ（そのままの文字列は保存しない）。
 * 例: 「iPhone・LINE」「Android・Chrome」「PC・Safari」
 */
export function summarizeUserAgent(ua: string): string {
  const s = ua || "";
  const os = /iPhone|iPod/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Macintosh|Windows|Linux/.test(s) ? "PC" : "不明";
  const app = /\bLine\//i.test(s)
    ? "LINE"
    : /CriOS|Chrome\//.test(s) && !/Edg\//.test(s)
      ? "Chrome"
      : /Edg\//.test(s)
        ? "Edge"
        : /FxiOS|Firefox\//.test(s)
          ? "Firefox"
          : /Safari\//.test(s)
            ? "Safari"
            : "その他";
  return `${os}・${app}`;
}

export type VenueResultRow = {
  id: string;
  createdAtMs: number;
  place: string;
  carrier: string;
  memo: string;
  device: string;
  liveId: string | null;
  metrics: VenueMetrics;
  people: number | null;
  verdict: Verdict;
};

/** 日付（日本時間の YYYY-MM-DD） */
export function jstDate(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 平均（null は除く。全部 null なら null） */
export function mean(values: readonly (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export type LiveSummary = { liveId: string; atMs: number; devices: number; perDeviceDown: number | null; perDeviceUp: number | null; totalDown: number | null; totalUp: number | null };

/** 同時測定の回ごとの、台数・1台あたりの速さ・合計 */
export function summarizeLive(rows: readonly VenueResultRow[]): LiveSummary[] {
  const by = new Map<string, VenueResultRow[]>();
  for (const r of rows) if (r.liveId) by.set(r.liveId, [...(by.get(r.liveId) ?? []), r]);
  return [...by].map(([liveId, rs]) => {
    const downs = rs.map((r) => r.metrics.downMbps);
    const ups = rs.map((r) => r.metrics.upMbps);
    const sum = (xs: (number | null)[]) => (xs.some((x) => x != null) ? xs.reduce<number>((a, b) => a + (b ?? 0), 0) : null);
    return {
      liveId,
      atMs: Math.min(...rs.map((r) => r.createdAtMs)),
      devices: rs.length,
      perDeviceDown: mean(downs),
      perDeviceUp: mean(ups),
      totalDown: sum(downs),
      totalUp: sum(ups),
    };
  }).sort((a, b) => a.atMs - b.atMs);
}

const CSV_COLUMNS: [string, (r: VenueResultRow) => string | number | null][] = [
  ["日時", (r) => new Date(r.createdAtMs + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 19)],
  ["場所", (r) => r.place],
  ["携帯会社", (r) => r.carrier],
  ["メモ", (r) => r.memo],
  ["端末", (r) => r.device],
  ["同時測定", (r) => r.liveId ?? ""],
  ["反応の中央値(ms)", (r) => r.metrics.pingMedianMs],
  ["ジッター(ms)", (r) => r.metrics.pingJitterMs],
  ["反応の失敗", (r) => r.metrics.pingFailed],
  ["下り(Mbps)", (r) => r.metrics.downMbps],
  ["上り(Mbps)", (r) => r.metrics.upMbps],
  ["タイムライン1画面(秒)", (r) => r.metrics.feedScreenSec],
  ["写真1枚の送信(秒)", (r) => r.metrics.uploadSecPerPhoto],
  ["データの読み書き(ms)", (r) => r.metrics.firestoreMs],
  ["足りる人数の目安", (r) => r.people],
  ["判定", (r) => VERDICT_LABEL[r.verdict]],
];

/** CSV（Excel で文字化けしないよう、先頭に BOM を付けるのは呼び出し側） */
export function toCsv(rows: readonly VenueResultRow[]): string {
  const cell = (v: string | number | null) => {
    if (v == null) return "";
    const s = typeof v === "number" ? String(Math.round(v * 100) / 100) : v;
    // ★式として解釈される頭の文字を無害にする★（CSV インジェクション対策。メモ・場所は自由入力）
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = CSV_COLUMNS.map(([h]) => cell(h)).join(",");
  const body = rows.map((r) => CSV_COLUMNS.map(([, f]) => cell(f(r))).join(","));
  return [head, ...body].join("\r\n");
}
