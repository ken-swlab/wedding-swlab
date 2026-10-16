import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { usingEmulator } from "@/lib/emulator";
import { auditBegin, auditEnd } from "@/lib/audit";
import { runtimeConfig, type LineNotifyMode } from "@/lib/runtime-config";
import { approvedFlexMessage, type LineNotifyKind } from "@/config/line-messages";
import { LINE_API_BASE, LINE_API_TIMEOUT_MS, LINE_OUTBOX_RETENTION_DAYS, LINE_QUOTA_MIN_REMAINING } from "@/config/line-notify";

/**
 * 公式 LINE（Messaging API）から通知を送る土台（Issue #168）。
 *
 * ★アプリから直接 LINE を呼ばない★ 出来事 → アウトボックス（Firestore の lineOutbox/{dedupeKey}）に1件書く →
 *   送信係（deliverOutbox）が LINE に送る → 結果を同じドキュメントに書く、の順で処理する。
 * ★重複防止のキーをドキュメント ID にする★（例: approved:<uid>）。create() は同じ ID があると失敗するので、
 *   承認を取り消して再承認しても、2通目は作られない＝送られない。
 * ★X-Line-Retry-Key に retryKey（作成時の UUID）を付ける★ 再送しても、LINE 側で重複が弾かれる
 *   （すでに受け付けた要求は 409。送れたものとして扱う）。
 * ★lineOutbox はクライアントから読み書きできない★ Rules に書かない（既定の拒否。Rules テストに DENY がある）。
 *   書くのはサーバーだけ。ゲストの画面から通知を送らせる API は作らない（送るのはサーバー側の出来事か、管理者の操作だけ）。
 * ★Firestore に LINE の応答本文・userId・トークンを書かない★ 残すのはエラーの種類（lastErrorCode）だけ。
 * ★文面に個人情報を入れない★ 文面は src/config/line-messages.ts。差し込みは URL だけ。
 * ★送るかどうかは config/runtime の lineNotify で決める★（既定 off）。トークン（LINE_CHANNEL_ACCESS_TOKEN）が
 *   無い環境（Preview・開発）は、自動的に off として扱う（エラーにしない）。
 */

export type OutboxStatus = "pending" | "sent" | "failed" | "skipped";

/** 送らなかった理由（status: skipped のとき） */
export type SkipReason = "off" | "noToken" | "dryRun" | "notAdmin" | "notLine" | "quota";

/**
 * 宛先。★今回は本人（uid）だけを実装する★
 * tag（タグを持つ全員）・query（条件。例: 開始時刻に未到着の人）は将来の拡張のために型だけ用意している。
 */
export type NotifyTarget = { type: "uid"; uid: string } | { type: "tag"; tag: string } | { type: "query"; name: string };

export type OutboxDoc = {
  uid: string;
  kind: LineNotifyKind;
  /** 差し込みの値。★個人情報を入れない★ 今は空 */
  params: Record<string, string>;
  status: OutboxStatus;
  attempts: number;
  /** エラーの種類だけ（例: http_400・timeout）。本文や userId は入れない */
  lastErrorCode: string | null;
  skipReason?: SkipReason;
  retryKey: string;
  createdAt: FieldValue;
  sentAt: FieldValue | null;
  expiresAt: Timestamp;
};

const COLLECTION = "lineOutbox";

/** 重複防止のキー（= ドキュメント ID）。uid の ":" はそのまま使える（Firestore の ID に使えない文字は "/" だけ） */
export function outboxKey(kind: LineNotifyKind, uid: string): string {
  return `${kind}:${uid}`;
}

/**
 * アウトボックスに1件作る。★同じキーがあれば作らない★（false を返す。二重に送らない）。
 * 送るのは deliverOutbox（呼び出し側が after() で呼ぶ）。
 */
export async function enqueueNotification(target: NotifyTarget, kind: LineNotifyKind, params: Record<string, string> = {}): Promise<string | null> {
  if (target.type !== "uid") throw new Error("[line-notify] 宛先はいまは本人（uid）だけです");
  const key = outboxKey(kind, target.uid);
  const doc: OutboxDoc = {
    uid: target.uid,
    kind,
    params,
    status: "pending",
    attempts: 0,
    lastErrorCode: null,
    retryKey: randomUUID(),
    createdAt: FieldValue.serverTimestamp(),
    sentAt: null,
    expiresAt: Timestamp.fromMillis(Date.now() + LINE_OUTBOX_RETENTION_DAYS * 86_400_000),
  };
  try {
    await admin().db.collection(COLLECTION).doc(key).create(doc);
    return key;
  } catch (e) {
    // 6 = ALREADY_EXISTS（すでに作った＝送ったか、送ろうとした）
    if ((e as { code?: unknown }).code === 6) return null;
    throw e;
  }
}

/**
 * 送るかどうか。トークンが無ければ、config/runtime の値にかかわらず off。
 * ★エミュレーターでは送らない★（Issue #83 の external と同じ考え。.env.local に本物のトークンがあっても、
 *   テストの承認で本物の LINE に届かないようにする）
 */
async function effectiveMode(): Promise<{ mode: LineNotifyMode; token: string | null }> {
  const token = usingEmulator ? null : process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || null;
  if (!token) return { mode: "off", token: null };
  return { mode: (await runtimeConfig()).lineNotify, token };
}

/** ゲストブックを開く LIFF の URL。★LIFF のエンドポイントは /invitation★（登録済みの人はゲストブックへ移る） */
function guestbookUrl(): string | null {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim();
  return liffId ? `https://liff.line.me/${encodeURIComponent(liffId)}` : null;
}

function messagesFor(kind: LineNotifyKind): unknown[] | null {
  const url = guestbookUrl();
  if (!url) return null;
  switch (kind) {
    case "approved":
      return [approvedFlexMessage(url)];
  }
}

async function lineFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${LINE_API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(LINE_API_TIMEOUT_MS),
    redirect: "error",
    cache: "no-store",
  });
}

/**
 * 今月の通数の残り。上限なしなら Infinity。★読めなければ null★（送らない側に倒す）。
 * GET /v2/bot/message/quota と /v2/bot/message/quota/consumption。
 */
async function remainingQuota(token: string): Promise<number | null> {
  try {
    const [q, c] = await Promise.all([lineFetch(token, "/v2/bot/message/quota"), lineFetch(token, "/v2/bot/message/quota/consumption")]);
    if (!q.ok || !c.ok) {
      console.error(`[line-notify] 通数の残りを読めませんでした（quota: ${q.status}、consumption: ${c.status}）`);
      return null;
    }
    const quota = (await q.json()) as { type?: unknown; value?: unknown };
    const used = (await c.json()) as { totalUsage?: unknown };
    if (quota.type === "none") return Infinity;
    if (typeof quota.value !== "number" || typeof used.totalUsage !== "number") return null;
    return quota.value - used.totalUsage;
  } catch (e) {
    console.error("[line-notify] 通数の残りを読めませんでした", e);
    return null;
  }
}

async function isAdminUid(uid: string): Promise<boolean> {
  try {
    return (await admin().auth.getUser(uid)).customClaims?.admin === true;
  } catch {
    return false;
  }
}

/** エラーの種類（Firestore と Sentry に残す。応答本文は残さない） */
function errorCode(e: unknown): string {
  const name = (e as { name?: unknown })?.name;
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  return "network";
}

export type DeliverResult = OutboxStatus | "missing" | "notPending";

/**
 * アウトボックスの1件を送る。★status が pending のものだけ★（送れた・送らなかったものに触らない）。
 * 失敗したら status: failed・attempts を増やす。自動の再送はしない（ops.mjs notify retry → 管理画面の再送）。
 * actorUid … 監査ログに残す実行者（承認した管理者・再送した管理者）
 */
export async function deliverOutbox(key: string, actorUid: string | null): Promise<DeliverResult> {
  const { db } = admin();
  const ref = db.collection(COLLECTION).doc(key);
  const snap = await ref.get();
  if (!snap.exists) return "missing";
  const doc = snap.data() as Omit<OutboxDoc, "createdAt" | "sentAt">;
  if (doc.status !== "pending") return "notPending";

  const skip = async (reason: SkipReason) => {
    await ref.update({ status: "skipped", skipReason: reason });
    return "skipped" as const;
  };

  const { mode, token } = await effectiveMode();
  if (!token) return skip("noToken");
  if (mode === "off") return skip("off");

  const messages = messagesFor(doc.kind);
  // LIFF の ID が無いと、ボタンの行き先を作れない（設定の漏れ。Sentry に知らせる）
  if (!messages) {
    console.error("[line-notify] NEXT_PUBLIC_LIFF_ID が無いので、通知の文面を作れません");
    await ref.update({ status: "failed", attempts: FieldValue.increment(1), lastErrorCode: "noLiffId" });
    return "failed";
  }
  if (mode === "dryRun") {
    // ★送る内容だけをログに出す★ userId・uid は出さない（種類と文面のテンプレートだけ）
    console.log(`[line-notify] dryRun: kind=${doc.kind} messages=${JSON.stringify(messages)}`);
    return skip("dryRun");
  }
  if (mode === "adminsOnly" && !(await isAdminUid(doc.uid))) return skip("notAdmin");
  if (!doc.uid.startsWith("line:")) return skip("notLine");

  const remaining = await remainingQuota(token);
  if (remaining === null || remaining < LINE_QUOTA_MIN_REMAINING) {
    console.error(
      remaining === null
        ? "[line-notify] 通数の残りが分からないため、送りませんでした"
        : `[line-notify] 今月の通数の残りが ${remaining} 通（閾値 ${LINE_QUOTA_MIN_REMAINING}）のため、送りませんでした`,
    );
    return skip("quota");
  }

  // ★送信の操作を監査ログに残す★ 残すのは種類のキー名だけ（値・userId は残さない）
  const requestId = `notify-${randomUUID()}`;
  const route = "line.notify.push";
  const started = Date.now();
  await auditBegin({
    requestId,
    route,
    method: "SERVER",
    action: "notify.send",
    actorUid,
    actorRole: "admin",
    targetId: doc.uid,
    fields: ["kind"],
    ipHash: null,
    userAgent: "line-notify-server",
  });

  let status: number | null = null;
  let code: string | null = null;
  try {
    const res = await lineFetch(token, "/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Line-Retry-Key": doc.retryKey },
      body: JSON.stringify({ to: doc.uid.slice("line:".length), messages }),
    });
    status = res.status;
    // 409 … 同じ retryKey の要求をすでに受け付けている（前回は送れていた）
    if (!res.ok && res.status !== 409) code = `http_${res.status}`;
  } catch (e) {
    code = errorCode(e);
  }

  if (code === null) {
    await ref.update({ status: "sent", attempts: FieldValue.increment(1), lastErrorCode: null, sentAt: FieldValue.serverTimestamp() });
  } else {
    console.error(`[line-notify] 送れませんでした（${code}）`);
    await ref.update({ status: "failed", attempts: FieldValue.increment(1), lastErrorCode: code });
  }
  await auditEnd(requestId, route, status ?? 599, Date.now() - started).catch((e: unknown) => console.error("[line-notify] 監査ログの終了を書けませんでした", e));
  return code === null ? "sent" : "failed";
}

/** 送信待ち（pending）を、古い順に関係なく limit 件まで送る（管理画面の再送。/api/admin/notify/retry） */
export async function deliverPending(limit: number, actorUid: string): Promise<Record<DeliverResult, number>> {
  const snap = await admin().db.collection(COLLECTION).where("status", "==", "pending").limit(limit).get();
  const counts: Record<DeliverResult, number> = { pending: 0, sent: 0, failed: 0, skipped: 0, missing: 0, notPending: 0 };
  for (const d of snap.docs) counts[await deliverOutbox(d.id, actorUid)] += 1;
  return counts;
}
