/// <reference types="@cloudflare/workers-types" />
import { detect, sanitize } from "./formats";

/**
 * wedding-exif-stripper — Cron Triggers 版
 *
 * ── 状態はすべて ORIGINALS 上のマーカーで持つ ──────────────────
 *   _linked/{key}    完了。Firestore に紐付いた
 *   _pending/{key}   公開バケットへは複製済み。webhook だけ未完了
 *                    customMetadata: { bytes }
 *   _failed/{key}    webhook の連続失敗カウンタ
 *                    customMetadata: { count }
 *   _skipped/{key}   隔離（恒久的に処理しない）
 *                    customMetadata: { reason, notified, attempts }
 *
 * ★原本そのものは動かさない★
 *   隔離＝マーカーを置くこと。24MB のオブジェクトを move すると
 *   GET+PUT+DELETE で 3 サブリクエスト＋全バイト転送がかかる。
 *   マーカーなら小さな PUT 1回で済み、原本は手動復旧のために残せる。
 *
 * ★無限ループを二重に塞ぐ★
 *   (1) 回数: _failed のカウンタが MAX_WEBHOOK_FAILURES に達したら隔離
 *   (2) 時間: uploaded から HARD_GIVEUP_HOURS を過ぎたら、カウンタの
 *             状態や webhook の生死に関わらず無条件で隔離
 *   (1) が何らかの理由で進まなくても (2) が必ず止める。
 *
 * ★「この1枚が悪い」と「システム全体が落ちている」を取り違えない★
 *   取り違えると、シークレットを入れ忘れただけで全ゲストの写真が
 *   一斉に _skipped/ へ落ちる。判定は run の最後にまとめて行う:
 *     - この run で1件でも webhook が成功した → 全体は健全
 *     - 1件も成功していない → ping を1回だけ撃って健全性を確かめる
 *   健全と確認できた run でのみ、失敗カウンタの加算と隔離を行う。
 */

// ═══════════════════════════════════════════════════════════════ types

export interface Env {
  ORIGINALS: R2Bucket;
  PUBLIC: R2Bucket;
  PUBLIC_BASE: string;
  WEBHOOK_URL: string;
  WEBHOOK_SECRET: string;
  MAX_PER_RUN?: string;
  MAX_BYTES?: string;
  UNLINKED_GIVEUP_HOURS?: string;
  HARD_GIVEUP_HOURS?: string;
  MAX_WEBHOOK_FAILURES?: string;
  MAX_NOTIFY_ATTEMPTS?: string;
  WEBHOOK_TIMEOUT_MS?: string;
  SUBREQUEST_BUDGET?: string;
}

type Outcome =
  | { kind: "ok" }
  /** 公開バケットには出したが Firestore にまだ対応する投稿がない */
  | { kind: "unlinked" }
  /** 設定ミス。run 全体を止める。個別キーの失敗として数えない */
  | { kind: "global"; detail: string }
  /** 一時障害またはこのキー固有の問題 */
  | { kind: "retry"; detail: string };

type SkipMarker = { reason: string; notified: boolean; attempts: number };

type Listing = {
  originals: Map<string, { size: number; uploaded: Date }>;
  linked: Set<string>;
  skipped: Map<string, SkipMarker>;
  failed: Map<string, number>;
  pending: Map<string, number>;
  pages: number;
  truncated: boolean;
};

/** run の最後に確定させる副作用 */
type Verdict = {
  key: string;
  nextCount: number;
  detail: string;
};

type Stats = {
  scanned: number;
  candidates: number;
  processed: number;
  linked: number;
  pending: number;
  quarantined: number;
  renotified: number;
  failed: number;
  deferred: number;
  healthy: boolean;
  subrequests: number;
  pages: number;
  truncated: boolean;
  abortedBy?: string;
};

// ═══════════════════════════════════════════════════════════ constants

const P_LINKED = "_linked/";
const P_SKIPPED = "_skipped/";
const P_FAILED = "_failed/";
const P_PENDING = "_pending/";

/** 処理対象は u/{uid}/o/{uuid}.{ext} だけ。Next.js 側の KEY_RE と一致させること */
const ORIGINAL_KEY_RE =
  /^u\/[A-Za-z0-9_.:-]{1,128}\/o\/[0-9a-fA-F-]{36}\.[a-z0-9]{1,8}$/;

const LIST_MAX_PAGES = 5;
/** 1 run 内で連続してこの回数 webhook が落ちたら、以降は触らずに撤退する */
const CIRCUIT_BREAK = 3;
/** 1候補あたりの最悪サブリクエスト数。予算の残りを見るときの単位 */
const COST_WORST = 6;
/** 隔離1件あたりの最悪サブリクエスト数（通知+マーカー+後始末2） */
const COST_QUARANTINE = 4;

const D_TIMEOUT_MS = 20_000;
const D_MAX_FAILURES = 3;
const D_MAX_NOTIFY = 5;
const D_BUDGET = 45;
const D_MAX_PER_RUN = 10;
const D_MAX_BYTES = 24 * 1024 * 1024;
const D_GIVEUP_HOURS = 24;
const D_HARD_GIVEUP_HOURS = 72;

/**
 * 「webhook 先の設定が間違っている」ことがほぼ確定するステータス。
 * 個別キーの失敗として数えず、run 全体を即中断する。
 */
const GLOBAL_STATUS = new Set([401, 403, 404, 405, 407, 421, 426, 429, 451, 530]);

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// ═════════════════════════════════════════════════════════════ helpers

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}

function extOf(key: string): string {
  const i = key.lastIndexOf(".");
  return i < 0 ? "" : key.slice(i + 1).toLowerCase();
}

function contentTypeFor(key: string): string {
  return EXT_MIME[extOf(key)] ?? "application/octet-stream";
}

function publicUrl(base: string, key: string): string {
  return `${base.replace(/\/+$/, "")}/${key}`;
}

function ageHours(uploaded: Date): number {
  return (Date.now() - uploaded.getTime()) / 3_600_000;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.byteLength !== eb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ea, eb);
}

// ═════════════════════════════════════════════════════════════ markers

async function markLinked(env: Env, key: string, url: string): Promise<void> {
  await env.ORIGINALS.put(P_LINKED + key, JSON.stringify({ url, at: nowIso() }), {
    httpMetadata: { contentType: "application/json" },
  });
}

async function markPending(env: Env, key: string, bytes: number): Promise<void> {
  await env.ORIGINALS.put(P_PENDING + key, JSON.stringify({ bytes, at: nowIso() }), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { bytes: String(bytes) },
  });
}

/**
 * 失敗カウンタ。値は customMetadata に置く。
 * list({include:["customMetadata"]}) で追加のサブリクエストなしに読めるため、
 * 「カウンタを読むためだけの GET」が 1 件も発生しない。
 */
async function markFailed(
  env: Env,
  key: string,
  count: number,
  detail: string,
): Promise<void> {
  await env.ORIGINALS.put(
    P_FAILED + key,
    JSON.stringify({ count, detail, at: nowIso() }),
    {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { count: String(count) },
    },
  );
}

async function markSkipped(
  env: Env,
  key: string,
  reason: string,
  detail: string,
  notified: boolean,
  attempts: number,
): Promise<void> {
  await env.ORIGINALS.put(
    P_SKIPPED + key,
    JSON.stringify({ reason, detail, notified, attempts, at: nowIso() }),
    {
      httpMetadata: { contentType: "application/json" },
      customMetadata: {
        reason,
        notified: notified ? "1" : "0",
        attempts: String(attempts),
      },
    },
  );
}

// ═════════════════════════════════════════════════════════════ listing

async function listState(env: Env): Promise<Listing> {
  const st: Listing = {
    originals: new Map(),
    linked: new Set(),
    skipped: new Map(),
    failed: new Map(),
    pending: new Map(),
    pages: 0,
    truncated: false,
  };

  let cursor: string | undefined = undefined;

  for (let page = 0; page < LIST_MAX_PAGES; page++) {
    const res = await env.ORIGINALS.list({
      limit: 1000,
      cursor,
      include: ["customMetadata"],
    });
    st.pages++;

    for (const o of res.objects) {
      if (o.key.startsWith(P_LINKED)) {
        st.linked.add(o.key.slice(P_LINKED.length));
        continue;
      }
      if (o.key.startsWith(P_SKIPPED)) {
        st.skipped.set(o.key.slice(P_SKIPPED.length), {
          reason: o.customMetadata?.reason ?? "unknown",
          notified: o.customMetadata?.notified === "1",
          attempts: Number(o.customMetadata?.attempts ?? "0") || 0,
        });
        continue;
      }
      if (o.key.startsWith(P_FAILED)) {
        st.failed.set(o.key.slice(P_FAILED.length), num(o.customMetadata?.count, 1));
        continue;
      }
      if (o.key.startsWith(P_PENDING)) {
        st.pending.set(o.key.slice(P_PENDING.length), num(o.customMetadata?.bytes, 0));
        continue;
      }
      if (ORIGINAL_KEY_RE.test(o.key)) {
        st.originals.set(o.key, { size: o.size, uploaded: o.uploaded });
      }
    }

    if (res.truncated) {
      cursor = res.cursor;
    } else {
      cursor = undefined;
      break;
    }
  }

  st.truncated = cursor !== undefined;
  return st;
}

// ═════════════════════════════════════════════════════════════ webhook

type Payload =
  | { key: string; status: "published"; bytes: number }
  | { key: string; status: "skipped"; reason: string; detail: string }
  /** 副作用のない生存確認。Firestore には触らない */
  | { status: "ping" };

async function callWebhook(env: Env, payload: Payload): Promise<Outcome> {
  const timeoutMs = num(env.WEBHOOK_TIMEOUT_MS, D_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      // workerd は redirect:"error" を実装していない（Request 構築時に TypeError）。
      // "manual" で受け取り、3xx を自前で異常扱いにする。
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "content-type": "application/json",
        "user-agent": "Wedding-Worker/1.0",
        "x-worker-secret": env.WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const err = e as { name?: string; message?: string };
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { kind: "retry", detail: `timeout after ${timeoutMs}ms` };
    }
    return {
      kind: "retry",
      detail: `network ${err?.name ?? "Error"}: ${err?.message ?? String(e)}`,
    };
  }

  // 3xx = URL の指定ミス（末尾スラッシュ / canonical など）。
  // 301/302 を follow すると POST が GET に落ちて body が消えるため必ず失敗扱い。
  if (res.status >= 300 && res.status < 400) {
    return {
      kind: "global",
      detail: `unexpected redirect ${res.status} -> ${res.headers.get("location") ?? "(none)"}`,
    };
  }

  if (res.status === 202) return { kind: "unlinked" };
  if (res.ok) return { kind: "ok" };

  const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
  const detail = `${res.status} ${body}`;

  // x-vercel-id が無い非2xx = Vercel まで到達していない = Cloudflare/DNS/WAF 層の拒否。
  // 1016 や 1003 はここで捕まる。個別キーの問題ではないので run ごと止める。
  if (!res.headers.has("x-vercel-id")) {
    return { kind: "global", detail: `edge rejection (no x-vercel-id): ${detail}` };
  }
  if (GLOBAL_STATUS.has(res.status)) return { kind: "global", detail };

  return { kind: "retry", detail };
}

// ════════════════════════════════════════════════════════════ main run

export async function runOnce(env: Env): Promise<Stats> {
  const maxPerRun = num(env.MAX_PER_RUN, D_MAX_PER_RUN);
  const maxBytes = num(env.MAX_BYTES, D_MAX_BYTES);
  const giveUpH = num(env.UNLINKED_GIVEUP_HOURS, D_GIVEUP_HOURS);
  const hardGiveUpH = num(env.HARD_GIVEUP_HOURS, D_HARD_GIVEUP_HOURS);
  const maxFailures = num(env.MAX_WEBHOOK_FAILURES, D_MAX_FAILURES);
  const maxNotify = num(env.MAX_NOTIFY_ATTEMPTS, D_MAX_NOTIFY);
  const budget = num(env.SUBREQUEST_BUDGET, D_BUDGET);

  const st = await listState(env);
  let spent = st.pages;

  const stats: Stats = {
    scanned: st.originals.size,
    candidates: 0,
    processed: 0,
    linked: 0,
    pending: 0,
    quarantined: 0,
    renotified: 0,
    failed: 0,
    deferred: 0,
    healthy: false,
    subrequests: 0,
    pages: st.pages,
    truncated: st.truncated,
  };

  /** この run で webhook が 2xx/202 を返した回数。健全性の直接の証拠 */
  let successes = 0;
  let consecutive = 0;
  let fatal: string | undefined;

  /** run の最後に確定させる失敗。健全と確認できなければ1件も書かない */
  const verdicts: Verdict[] = [];

  /** 未通知の隔離。後処理で再通知を試みる */
  const unnotified = [...st.skipped.entries()].filter(
    ([, m]) => !m.notified && m.attempts < maxNotify,
  ).length;

  /**
   * 後処理に必要なぶんだけ予算を取り置く。固定枠にすると、
   * 失敗が1件も無い健全な run でも無駄に処理件数が削られる。
   */
  const epilogueReserve = (): number =>
    (successes === 0 && (verdicts.length > 0 || unnotified > 0) ? 1 : 0) +
    verdicts.length * COST_QUARANTINE;

  /**
   * 隔離マーカーを書き、UI に伝えるため webhook にも通知する。
   * 通知は best-effort。落ちていたら notified=0 で残り、後続 run が拾い直す。
   */
  const quarantine = async (
    key: string,
    reason: string,
    detail: string,
    hadFailed: boolean,
    hadPending: boolean,
  ): Promise<void> => {
    let notified = false;
    const out = await callWebhook(env, { key, status: "skipped", reason, detail });
    spent += 1;
    if (out.kind === "ok") {
      notified = true;
      successes += 1;
      consecutive = 0;
    } else if (out.kind === "unlinked") {
      // 対応する投稿が無い＝伝える相手がいない。届けた扱いで打ち切る
      notified = true;
      successes += 1;
      consecutive = 0;
    }

    await markSkipped(env, key, reason, detail, notified, 1);
    spent += 1;
    if (hadFailed) {
      await env.ORIGINALS.delete(P_FAILED + key);
      spent += 1;
    }
    if (hadPending) {
      await env.ORIGINALS.delete(P_PENDING + key);
      spent += 1;
    }
    console.warn(`[quarantine] ${key} reason=${reason} notified=${notified} ${detail}`);
    stats.quarantined += 1;
  };

  // ──────────────────────────────────────────────── 走査と処理
  const candidates = [...st.originals.keys()]
    .filter((k) => !st.linked.has(k) && !st.skipped.has(k))
    .sort((a, b) => {
      // 失敗履歴の少ないものから。健全なキーを先に通して successes を稼ぐ
      const d = (st.failed.get(a) ?? 0) - (st.failed.get(b) ?? 0);
      if (d !== 0) return d;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  stats.candidates = candidates.length;

  for (const key of candidates) {
    if (stats.processed >= maxPerRun) break;
    if (spent + COST_WORST + epilogueReserve() > budget) {
      stats.abortedBy = `subrequest budget (${spent}/${budget})`;
      break;
    }
    if (consecutive >= CIRCUIT_BREAK) {
      stats.abortedBy = `circuit breaker: ${consecutive} consecutive webhook failures`;
      break;
    }

    const meta = st.originals.get(key);
    if (!meta) continue;

    const fails = st.failed.get(key) ?? 0;
    const isPending = st.pending.has(key);
    const age = ageHours(meta.uploaded);

    // ── (1) 時間による無条件の打ち切り ─────────────────────────
    //   webhook の生死を問わない。永久ループを塞ぐ最後の砦。
    if (age > hardGiveUpH) {
      await quarantine(
        key,
        "hard_timeout",
        `${Math.round(age)}h 経過しても完了しない（失敗 ${fails} 回）`,
        fails > 0,
        isPending,
      );
      stats.processed += 1;
      continue;
    }

    // ── (2) 公開済みだが紐付かないまま期限切れ ───────────────────
    if (isPending && age > giveUpH) {
      await quarantine(
        key,
        "unlinked_timeout",
        `${giveUpH}h 以内に対応する投稿が見つからない`,
        fails > 0,
        true,
      );
      stats.processed += 1;
      continue;
    }

    // ── (3) バイト列を見て決まる隔離（webhook の健全性に依存しない）──
    let bytes = st.pending.get(key) ?? 0;

    if (!isPending) {
      if (meta.size > maxBytes) {
        await quarantine(key, "too_large", `${meta.size}B（上限 ${maxBytes}B）`, fails > 0, false);
        stats.processed += 1;
        continue;
      }

      const obj = await env.ORIGINALS.get(key);
      spent += 1;
      if (!obj) {
        await quarantine(key, "missing", "原本が見つからない（削除済み）", fails > 0, false);
        stats.processed += 1;
        continue;
      }

      const input = new Uint8Array(await obj.arrayBuffer());
      const format = detect(input);
      const result = sanitize(input);

      if (result.status !== "ok") {
        await quarantine(
          key,
          result.status === "unsupported" ? "unsupported_format" : "broken_file",
          `${format}: ${result.reason}`,
          fails > 0,
          false,
        );
        stats.processed += 1;
        continue;
      }

      await env.PUBLIC.put(key, result.out, {
        httpMetadata: {
          contentType: result.contentType || contentTypeFor(key),
          // キーは UUID で内容が変わらないため恒久キャッシュでよい
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
      spent += 1;
      bytes = result.out.length;
    }

    // ── (4) webhook ───────────────────────────────────────────
    const outcome = await callWebhook(env, { key, status: "published", bytes });
    spent += 1;
    stats.processed += 1;

    if (outcome.kind === "global") {
      // 設定ミス。カウンタには触らず run を止める。
      // 公開バケットへは出ているので _pending を残し、次回は webhook だけ再送する。
      console.error(`[config] ${key}: ${outcome.detail}`);
      stats.abortedBy = `config error: ${outcome.detail}`;
      fatal = outcome.detail;
      if (!isPending) {
        await markPending(env, key, bytes);
        spent += 1;
      }
      break;
    }

    if (outcome.kind === "retry") {
      consecutive += 1;
      stats.failed += 1;
      // ★ここではまだ書かない★ run 全体が健全だったかを見てから確定させる
      verdicts.push({ key, nextCount: fails + 1, detail: outcome.detail });
      if (!isPending) {
        await markPending(env, key, bytes);
        spent += 1;
      }
      continue;
    }

    successes += 1;
    consecutive = 0;

    if (outcome.kind === "unlinked") {
      if (!isPending) {
        await markPending(env, key, bytes);
        spent += 1;
      }
      stats.pending += 1;
      continue;
    }

    await markLinked(env, key, publicUrl(env.PUBLIC_BASE, key));
    spent += 1;
    if (isPending) {
      await env.ORIGINALS.delete(P_PENDING + key);
      spent += 1;
    }
    if (fails > 0) {
      await env.ORIGINALS.delete(P_FAILED + key);
      spent += 1;
    }
    stats.linked += 1;
  }

  // ─────────────────────────────────────────── 健全性の確定
  //
  // 「1件も成功していない」だけでは全体障害と個別障害を区別できない。
  //   - 処理対象が1件しかなく、それが壊れている場合 → 個別障害
  //   - Vercel が落ちている場合                     → 全体障害
  // 副作用のない ping を1回だけ撃って区別する。
  const needsVerdict = verdicts.length > 0 || unnotified > 0;

  let healthy = successes > 0;
  if (!fatal && !healthy && needsVerdict && spent + 1 <= budget) {
    const ping = await callWebhook(env, { status: "ping" });
    spent += 1;
    healthy = ping.kind === "ok";
    if (ping.kind === "global") {
      fatal = ping.detail;
      stats.abortedBy = `config error on ping: ${ping.detail}`;
      console.error(`[config] ping: ${ping.detail}`);
    }
  }
  stats.healthy = healthy;

  // ─────────────────────────────────────────── 失敗の確定と隔離
  if (!fatal && healthy) {
    for (const v of verdicts) {
      if (spent + COST_QUARANTINE > budget) {
        stats.abortedBy = stats.abortedBy ?? `subrequest budget during epilogue (${spent}/${budget})`;
        break;
      }
      if (v.nextCount >= maxFailures) {
        await quarantine(
          v.key,
          "webhook_failed",
          `webhook が ${v.nextCount} 回連続で失敗: ${v.detail}`,
          st.failed.has(v.key),
          true, // retry 経路を通ったキーは必ず _pending が付いている
        );
      } else {
        console.warn(`[retry ${v.nextCount}/${maxFailures}] ${v.key}: ${v.detail}`);
        await markFailed(env, v.key, v.nextCount, v.detail);
        spent += 1;
      }
    }
  } else if (verdicts.length > 0) {
    // 全体障害。カウンタを1つも進めない。次の run で素直にやり直す
    stats.deferred += verdicts.length;
    console.warn(
      `[hold] webhook 全体が不調のため ${verdicts.length} 件のカウンタ加算を見送り`,
    );
  }

  // ─────────────────────────────────────────── 未通知の隔離を再通知
  if (!fatal && healthy) {
    for (const [key, marker] of st.skipped) {
      if (spent + 2 > budget) break;
      if (consecutive >= CIRCUIT_BREAK) break;
      if (marker.notified) continue;
      if (marker.attempts >= maxNotify) continue;

      const out = await callWebhook(env, {
        key,
        status: "skipped",
        reason: marker.reason,
        detail: "再通知",
      });
      spent += 1;

      if (out.kind === "global") {
        stats.abortedBy = `config error on renotify: ${out.detail}`;
        break;
      }
      const delivered = out.kind === "ok" || out.kind === "unlinked";
      if (!delivered) consecutive += 1;

      await markSkipped(
        env,
        key,
        marker.reason,
        delivered ? "再通知済み" : "再通知に失敗",
        delivered,
        marker.attempts + 1,
      );
      spent += 1;
      if (delivered) stats.renotified += 1;
    }
  }

  stats.subrequests = spent;
  return stats;
}

// ═══════════════════════════════════════════════════════════ handlers

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      runOnce(env)
        .then((s) => console.log("[cron]", JSON.stringify(s)))
        .catch((e) =>
          console.error("[cron] fatal", e instanceof Error ? e.stack : String(e)),
        ),
    );
  },

  /**
   * 手動実行用。Cron を待たずに確認したいときに使う。
   *   curl -X POST -H "x-worker-secret: <値>" https://<worker>.workers.dev/run
   */
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/run") {
      const given = req.headers.get("x-worker-secret") ?? "";
      // 定時間比較。素の !== だと前方一致の度合いが応答時間に出る
      if (!timingSafeEqualStr(given, env.WEBHOOK_SECRET)) {
        return new Response("forbidden", { status: 403 });
      }
      const stats = await runOnce(env);
      return Response.json(stats);
    }

    return new Response("not found", { status: 404 });
  },
};
