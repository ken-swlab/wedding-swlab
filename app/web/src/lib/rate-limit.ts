import "server-only";
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";

/**
 * レートリミット（2段構え）
 *
 * ★1段目: インスタンス内のカウンタ★
 *   同じインスタンスに連打が来た時点で、Firestore に触らずに弾く。
 *   Firestore 側だけで数えると、攻撃のたびに読み書きが発生して
 *   「レートリミットそのものが課金を増やす」ことになる。
 *
 * ★2段目: Firestore のトランザクション★
 *   インスタンスをまたいだ正確な上限。Admin SDK のトランザクションは
 *   悲観ロックなので、同じキーへの同時アクセスは順番待ちになり、
 *   ちょうど limit 件だけが通る（ロックを使わない increment 方式だと
 *   同時に来た全員が上限超過に見えて全員弾かれることがある）。
 *
 * ★上限を超えたリクエストは Firestore に書き込まない★
 *   読み取り1回だけで返す。書き込みを増やさないため。
 *
 * ★ドキュメントIDにはハッシュを使う★
 *   uid や IP をそのまま ID にすると、TTL で消えるまでの最大24時間
 *   Firestore に識別子が残る。ハッシュなら中身を持たない。
 */

export type RateLimitRule = {
  /** uid = 認証済みの本人単位 / ip = 送信元単位 */
  key: "uid" | "ip";
  /** 窓の中で許す回数 */
  limit: number;
  /** 窓の長さ（秒） */
  windowSec: number;
};

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number; tier: "local" | "global" };

const LOCAL_MAX_KEYS = 5_000;
const local = new Map<string, { window: number; count: number }>();

/** テスト用。本番コードからは呼ばない */
export function __resetLocalForTest() {
  local.clear();
}

function localAllows(id: string, window: number, limit: number): boolean {
  const cur = local.get(id);
  if (cur && cur.window === window) {
    cur.count += 1;
    return cur.count <= limit;
  }
  if (local.size >= LOCAL_MAX_KEYS) {
    // 過去の窓のものから捨てる。それでも溢れるなら全消去
    for (const [k, v] of local) if (v.window < window) local.delete(k);
    if (local.size >= LOCAL_MAX_KEYS) local.clear();
  }
  local.set(id, { window, count: 1 });
  return 1 <= limit;
}

export function rateLimitDocId(bucket: string, key: string, subject: string, window: number): string {
  const h = createHash("sha256").update(`${bucket}\u0000${key}\u0000${subject}`).digest("hex").slice(0, 32);
  return `${bucket}_${window}_${h}`;
}

export async function checkRateLimit(
  bucket: string,
  subject: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const windowMs = rule.windowSec * 1000;
  const window = Math.floor(now / windowMs);
  const retryAfterSec = Math.max(1, Math.ceil(((window + 1) * windowMs - now) / 1000));
  const localId = `${bucket}\u0000${rule.key}\u0000${subject}`;

  if (!localAllows(localId, window, rule.limit)) {
    return { ok: false, retryAfterSec, tier: "local" };
  }

  const { db } = admin();
  const ref = db.collection("rateLimits").doc(rateLimitDocId(bucket, rule.key, subject, window));

  const count = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const n = (snap.get("count") as number | undefined) ?? 0;
    if (n >= rule.limit) return n + 1; // 上限超過。書き込まずに抜ける
    tx.set(
      ref,
      {
        bucket,
        key: rule.key,
        window,
        count: n + 1,
        // ★TTL の対象フィールドは Timestamp 型でなければならない★
        //   数値で入れると TTL ポリシーに無視されて永久に残る。
        //   窓が閉じてさらに1窓ぶん経ったら消してよい。
        expiresAt: Timestamp.fromMillis((window + 2) * windowMs),
      },
      { merge: true },
    );
    return n + 1;
  });

  if (count > rule.limit) return { ok: false, retryAfterSec, tier: "global" };
  return { ok: true, remaining: rule.limit - count };
}
