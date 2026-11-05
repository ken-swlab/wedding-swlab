/**
 * 会場の電波テスト（Issue #256。管理者用 /admin/venue-test）の設定。
 * ★このファイルは何も import しない★（tests/ が Node でそのまま読み込む。lib/venue-test.ts の計算に渡す）
 *
 * 1人あたりに必要な速さ:
 *   見る … タイムラインの1画面（約 1MB）を 3 秒以内 → 1MB × 8 ÷ 3 秒 ≒ 2.7Mbps
 *   送る … 軽い版の写真1枚（約 1MB）を 5 秒以内 → 1MB × 8 ÷ 5 秒 = 1.6Mbps
 * 同時に使う割合（乾杯の直後を想定）: 見る 40%・送る 20%。
 * 「この速さを何人で分けても足りるか」= 下り ÷（2.7 × 0.4）と 上り ÷（1.6 × 0.2）の小さいほう。
 */
export const VENUE_TEST = {
  /** 当日の想定の人数（判定の基準） */
  expectedGuests: 70,
  perPerson: { viewMbps: 2.7, sendMbps: 1.6 },
  concurrency: { view: 0.4, send: 0.2 },
  /** 判定: 足りる人数 ÷ 想定の人数 が roomy 以上で「余裕」、caution 以上で「注意」、それ未満は「厳しい」 */
  verdict: { roomy: 1.5, caution: 1.0 },

  /** 1. 反応の速さ: /api/health に何回 */
  pingCount: 20,
  /** 2. 写真を見る速さ: feed 相当（100KB）を同時に10枚・1.5MB を同時に3枚（R2 の公開バケットの test/venue/fixtures/） */
  download: { feedCount: 10, feedBytes: 100_000, bigCount: 3, bigBytes: 1_500_000 },
  /** 3. 写真を送る速さ: 1MB のダミーを3回（公開バケットの test/venue/up/。測り終わったら消す） */
  upload: { count: 3, bytes: 1_000_000 },
  /** 4. データの読み書き: Firestore に1件書いて読み直す、を何回 */
  firestoreCount: 3,
  /** 1つの通信を待つ上限（会場で止まったままにしない） */
  requestTimeoutMs: 20_000,

  /** 同時測定: 「始める」を押してから一斉に測り始めるまで */
  liveDelayMs: 15_000,

  places: ["窓側", "真ん中", "壁側", "入口"],
  carriers: ["docomo", "au", "SoftBank", "楽天", "その他"],
  placeMax: 40,
  memoMax: 200,

  /** R2 の置き場所（本番の投稿の u/ と分ける） */
  fixturePrefix: "test/venue/fixtures/",
  uploadPrefix: "test/venue/up/",
  /** ダッシュボードで読む件数（Rules の上限と同じ） */
  listLimit: 500,
} as const;

export type VenueTestConfig = typeof VENUE_TEST;

/** テスト用の写真のファイル名（ops.mjs venue-test fixtures が、この名前と大きさちょうどで置く） */
export function fixtureKeys(cfg: VenueTestConfig = VENUE_TEST): { feed: string[]; big: string[] } {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    feed: Array.from({ length: cfg.download.feedCount }, (_, i) => `${cfg.fixturePrefix}feed-${pad(i + 1)}.jpg`),
    big: Array.from({ length: cfg.download.bigCount }, (_, i) => `${cfg.fixturePrefix}big-${pad(i + 1)}.jpg`),
  };
}
