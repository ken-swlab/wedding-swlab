import "server-only";
import { createHmac } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";

/**
 * 監査ログ（auditLogs）
 *
 * ★追記専用（append-only）★
 *   1件の操作につき「開始（-b）」と「終了（-e）」の2ドキュメントを
 *   create() で書く。create() は同じ ID が既にあると失敗するので、
 *   アプリのバグでも既存の記録を上書きできない。update は一切使わない。
 *   開始だけあって終了が無い記録は「処理が途中で落ちた」証拠として残る。
 *
 * ★値は記録しない。キー名だけ★
 *   allergy: "えび" のような値を監査ログに書くと、要配慮個人情報が
 *   二重に保管され、削除依頼への対応範囲も倍になる。
 *   「誰が・いつ・何を・どの項目を」までを残し、「何に変えたか」は
 *   本体のデータを見る。
 *
 * ★Security Rules は変更不要★
 *   末尾の match /{document=**} { allow read, write: if false; } により
 *   クライアントからは読めも書けもしない。Admin SDK だけが触れる。
 *
 * ★改ざん耐性の本命は GCS の WORM エクスポート★
 *   Firestore 上の記録はサービスアカウント鍵を持つ者なら消せる。
 *   毎日 Bucket Lock 付きの GCS へエクスポートすることで、
 *   エクスポート済みの記録は誰にも消せなくなる（infra/terraform/audit.tf）。
 */

/** Firestore 上の保持日数。これを過ぎると TTL ポリシーで自動削除される */
export const AUDIT_RETENTION_DAYS = 400;

export type ActorRole = "admin" | "user" | "anonymous";

export type AuditBegin = {
  requestId: string;
  route: string;
  method: string;
  action: string;
  actorUid: string | null;
  actorRole: ActorRole;
  targetId: string | null;
  fields: string[];
  ipHash: string | null;
  userAgent: string;
};

/**
 * IP アドレスは生で残さず、HMAC で仮名化する。
 * 同じ IP からの操作を突き合わせることはできるが、元の IP には戻せない。
 * AUDIT_IP_SALT が未設定なら IP は一切記録しない。
 */
export function hashIp(ip: string | null | undefined): string | null {
  const salt = process.env.AUDIT_IP_SALT;
  if (!ip || !salt) return null;
  return createHmac("sha256", salt).update(ip).digest("hex").slice(0, 16);
}

/** リクエスト本文のキー名だけを取り出す（値は捨てる） */
export function bodyFields(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.keys(body)
    .filter((k) => /^[A-Za-z0-9_]{1,64}$/.test(k))
    .sort()
    .slice(0, 30);
}

function expiresAt(): Timestamp {
  return Timestamp.fromMillis(Date.now() + AUDIT_RETENTION_DAYS * 86_400_000);
}

export async function auditBegin(e: AuditBegin, phase: "begin" | "denied" = "begin", status?: number) {
  const { db } = admin();
  const suffix = phase === "denied" ? "d" : "b";
  await db
    .collection("auditLogs")
    .doc(`${e.requestId}-${suffix}`)
    .create({
      ...e,
      phase,
      ...(status !== undefined ? { status } : {}),
      at: FieldValue.serverTimestamp(),
      expiresAt: expiresAt(),
    });
}

export type AuditOutcome = "success" | "rejected" | "error";

export function outcomeOf(status: number): AuditOutcome {
  if (status < 400) return "success";
  if (status < 500) return "rejected";
  return "error";
}

export async function auditEnd(requestId: string, route: string, status: number, durationMs: number) {
  const { db } = admin();
  await db
    .collection("auditLogs")
    .doc(`${requestId}-e`)
    .create({
      requestId,
      route,
      phase: "end",
      result: outcomeOf(status),
      status,
      durationMs,
      at: FieldValue.serverTimestamp(),
      expiresAt: expiresAt(),
    });
}
