import "server-only";
import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { ipAddress } from "@vercel/functions";
import * as Sentry from "@sentry/nextjs";
import { admin } from "@/lib/firebase-admin";
import { checkRateLimit, type RateLimitRule } from "@/lib/rate-limit";
import { auditBegin, auditEnd, bodyFields, hashIp, type ActorRole } from "@/lib/audit";
import { runtimeConfig } from "@/lib/runtime-config";

/**
 * ★全 API ルートの共通の入口★
 *
 *   認証・メンテナンス・レートリミット・監査ログ・エラー通知を
 *   ここ1箇所に集める。各ルートは
 *     export const POST = withGuard({ ... }, _POST);
 *   の1行で包むだけでよい。
 *
 * ★ここは「外側の関所」であって、唯一の防御ではない★
 *   各ルートの中にある verifyIdToken(token, true)（失効チェック付き）は
 *   そのまま残している。このラッパーは署名の検証だけを行い、
 *   失効チェック（毎回 Firebase Auth へ問い合わせが発生する）は
 *   ルート側に任せる。こうすると
 *     - 問い合わせは従来どおり1回で済む
 *     - ラッパーを外してもルートは無防備にならない（多層防御）
 *     - 監査ログの実行者（actorUid）は署名検証済みなので信用できる
 *   失効済みトークンはラッパーを通過してもルート側で 401 になり、
 *   その 401 も監査ログに残る。
 */

type Json = Record<string, unknown>;

export type GuardOptions = {
  /** Sentry のタグ・レートリミットのバケット・監査ログの route に使う名前 */
  name: string;
  /**
   * none  : 認証しない（ログイン API、Worker の webhook）
   * user  : 有効な ID トークンが必要
   * admin : 有効な ID トークン + admin クレームが必要
   */
  auth: "none" | "user" | "admin";
  rateLimit?: RateLimitRule;
  /** 設定したメソッドだけ監査ログを書く（更新系にだけ付ける） */
  audit?: {
    action: string | ((body: Json) => string);
    /** 操作対象の ID。本文から取り出す。自分自身が対象なら actorUid を返す */
    target?: (body: Json, actorUid: string | null) => unknown;
  };
  /** メンテナンス中でも通す（ログインと Worker の webhook） */
  maintenanceExempt?: boolean;
  /** 本文の上限。Content-Length が付いているときだけ検査する */
  maxBodyBytes?: number;
};

type Handler = (req: Request) => Response | Promise<Response>;

type Identity = { uid: string; isAdmin: boolean };

const DEFAULT_MAX_BODY = 256 * 1024;

function reply(status: number, message: string, requestId: string, headers?: Record<string, string>) {
  return NextResponse.json(
    { ok: false, message, requestId },
    { status, headers: { "x-request-id": requestId, ...headers } },
  );
}

function clientIp(req: Request): string {
  // Vercel が付ける信頼できるヘッダから取る。ローカル開発では undefined
  return ipAddress(req) ?? "unknown";
}

async function identify(req: Request): Promise<Identity | null | "invalid"> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    // ★失効チェックは付けない★ 署名と有効期限だけ。上のコメント参照
    const d = await admin().auth.verifyIdToken(token);
    return { uid: d.uid, isAdmin: d.admin === true };
  } catch {
    return "invalid";
  }
}

async function readJson(req: Request): Promise<Json> {
  try {
    const v: unknown = await req.clone().json();
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
  } catch {
    return {};
  }
}

/** 同じバケットの上限超過を Sentry に何度も送らないための印 */
const notified = new Set<string>();
function notifyRateLimited(bucket: string, window: number) {
  const k = `${bucket}:${window}`;
  if (notified.has(k)) return;
  if (notified.size > 1000) notified.clear();
  notified.add(k);
  Sentry.captureMessage(`[rate-limit] ${bucket} で上限超過が発生しています`, "warning");
}

export function withGuard(opts: GuardOptions, handler: Handler) {
  return async function guarded(req: Request): Promise<Response> {
    const requestId = randomUUID();
    const started = Date.now();

    return Sentry.withIsolationScope(async (scope) => {
      scope.setTag("route", opts.name);
      scope.setTag("request_id", requestId);
      scope.setTag("method", req.method);

      // ---- 1. 本文の大きさ ----------------------------------------------
      const len = Number(req.headers.get("content-length") ?? "0");
      if (Number.isFinite(len) && len > (opts.maxBodyBytes ?? DEFAULT_MAX_BODY)) {
        return reply(413, "送信データが大きすぎます", requestId);
      }

      // ---- 2. 本人確認（署名のみ）--------------------------------------
      let identity: Identity | null = null;
      if (opts.auth !== "none") {
        const r = await identify(req);
        if (r === null) return reply(401, "認証情報がありません", requestId);
        if (r === "invalid") return reply(401, "ログインし直してください", requestId);
        identity = r;
      }
      const ip = clientIp(req);
      const actorRole: ActorRole = identity ? (identity.isAdmin ? "admin" : "user") : "anonymous";

      // ---- 3. メンテナンス（キルスイッチ）------------------------------
      if (!opts.maintenanceExempt && !identity?.isAdmin) {
        const cfg = await runtimeConfig();
        if (cfg.maintenance) {
          return reply(503, cfg.message || "ただいまメンテナンス中です。しばらくお待ちください", requestId, {
            "Retry-After": "60",
          });
        }
      }

      // ---- 4. 管理者ルートの権限 ---------------------------------------
      if (opts.auth === "admin" && identity && !identity.isAdmin) {
        // ログイン済みのゲストが管理 API を叩いた。これは記録に値する
        try {
          await auditBegin(
            {
              requestId,
              route: opts.name,
              method: req.method,
              action: "admin.denied",
              actorUid: identity.uid,
              actorRole,
              targetId: null,
              fields: [],
              ipHash: hashIp(ip),
              userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200),
            },
            "denied",
            403,
          );
        } catch (e) {
          Sentry.captureException(e, { tags: { stage: "audit-denied" } });
        }
        return reply(403, "管理者権限が必要です", requestId);
      }

      // ---- 5. レートリミット -------------------------------------------
      if (opts.rateLimit) {
        const subject = opts.rateLimit.key === "uid" && identity ? identity.uid : ip;
        try {
          const rl = await checkRateLimit(opts.name, subject, opts.rateLimit);
          if (!rl.ok) {
            notifyRateLimited(opts.name, Math.floor(Date.now() / (opts.rateLimit.windowSec * 1000)));
            return reply(429, "リクエストが多すぎます。しばらくしてからお試しください", requestId, {
              "Retry-After": String(rl.retryAfterSec),
            });
          }
        } catch (e) {
          // ★レートリミットは fail-open★ 課金対策であって認可ではない。
          //   Firestore の不調で全 API が止まるほうが被害が大きい。
          Sentry.captureException(e, { tags: { stage: "rate-limit" } });
        }
      }

      // ---- 6. 監査ログ（開始）-----------------------------------------
      //   ★処理の「前」に書く★ ここで書けなければ何も実行していないので、
      //   安全に中止できる（fail-closed）。披露宴当日など可用性を優先したい
      //   ときは AUDIT_FAIL_OPEN=true で続行させる。
      let audited = false;
      if (opts.audit) {
        const body = await readJson(req);
        const actorUid = identity?.uid ?? null;
        const action =
          typeof opts.audit.action === "function" ? opts.audit.action(body) : opts.audit.action;
        const rawTarget = opts.audit.target?.(body, actorUid);
        try {
          await auditBegin({
            requestId,
            route: opts.name,
            method: req.method,
            action: String(action).slice(0, 64),
            actorUid,
            actorRole,
            targetId: typeof rawTarget === "string" && rawTarget ? rawTarget.slice(0, 128) : null,
            fields: bodyFields(body),
            ipHash: hashIp(ip),
            userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200),
          });
          audited = true;
        } catch (e) {
          Sentry.captureException(e, { tags: { stage: "audit-begin" } });
          if (process.env.AUDIT_FAIL_OPEN !== "true") {
            return reply(503, "操作記録を保存できないため、処理を中止しました。時間をおいて再度お試しください", requestId);
          }
        }
      }

      // ---- 7. 本体 ------------------------------------------------------
      let res: Response;
      try {
        res = await handler(req);
      } catch (e) {
        // 各ルートは自前で catch しているので、ここに来るのは想定外の例外だけ
        Sentry.captureException(e, { tags: { stage: "handler" } });
        console.warn(`[guard] ${opts.name} 未捕捉の例外 requestId=${requestId}`);
        res = reply(500, "サーバー内部エラー", requestId);
      }

      // ---- 8. 監査ログ（終了）: 応答を返してから書く ---------------------
      if (audited) {
        const status = res.status;
        const ms = Date.now() - started;
        after(async () => {
          try {
            await auditEnd(requestId, opts.name, status, ms);
          } catch (e) {
            // 開始記録は残っているので、欠けても「途中で落ちた」ことは分かる
            Sentry.captureException(e, { tags: { stage: "audit-end" } });
          }
        });
      }

      // ---- 9. 相関 ID を付けて返す --------------------------------------
      try {
        res.headers.set("x-request-id", requestId);
      } catch {
        /* fetch の応答をそのまま返すルートはヘッダが不変。付けられなくても問題ない */
      }
      return res;
    });
  };
}
