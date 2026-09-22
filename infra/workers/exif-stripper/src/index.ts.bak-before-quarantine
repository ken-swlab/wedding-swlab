import { detect, sanitize } from "./formats";

export interface Env {
  ORIGINALS: R2Bucket;
  PUBLIC: R2Bucket;
  PUBLIC_BASE: string;
  WEBHOOK_URL: string;
  WEBHOOK_SECRET: string;
  MAX_PER_RUN: string;
  MAX_BYTES: string;
  UNLINKED_GIVEUP_HOURS: string;
}

/** 処理対象は u/{uid}/o/{uuid}.{ext} だけ */
const KEY_RE = /^u\/[A-Za-z0-9_.:-]{1,128}\/o\/[0-9a-fA-F-]{36}\.[a-z0-9]{1,8}$/;

const LINKED = "_linked/";
const SKIPPED = "_skipped/";

type Candidate = { key: string; uploaded: Date };

/**
 * バケットを1回なめて、原本・完了マーカー・隔離マーカーを仕分ける。
 *
 * ★完了の記録を「公開できたか」ではなく「Firestore に紐付いたか」に置く★
 *   公開後に Webhook が失敗した場合、公開バケットの有無で判定していると
 *   次回から除外されて originalUrl が永久に埋まらない。
 *   公開側への PUT は冪等なので、紐付くまで何度やり直してもよい。
 */
async function collect(env: Env): Promise<Candidate[]> {
  const originals: Candidate[] = [];
  const linked = new Set<string>();
  const skipped = new Set<string>();

  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const res = await env.ORIGINALS.list({ limit: 1000, cursor });
    for (const o of res.objects) {
      if (o.key.startsWith(LINKED)) linked.add(o.key.slice(LINKED.length));
      else if (o.key.startsWith(SKIPPED)) skipped.add(o.key.slice(SKIPPED.length));
      else if (KEY_RE.test(o.key)) originals.push({ key: o.key, uploaded: o.uploaded });
    }
    if (!res.truncated) break;
    cursor = res.cursor;
  }

  return originals
    .filter((c) => !linked.has(c.key) && !skipped.has(c.key))
    .sort((a, b) => a.uploaded.getTime() - b.uploaded.getTime());
}

async function quarantine(env: Env, key: string, reason: string) {
  await env.ORIGINALS.put(
    SKIPPED + key,
    JSON.stringify({ key, reason, at: new Date().toISOString() }),
    { httpMetadata: { contentType: "application/json" } },
  );
  console.warn(`[hold] ${key}: ${reason}`);
}

async function markLinked(env: Env, key: string, url: string) {
  await env.ORIGINALS.put(
    LINKED + key,
    JSON.stringify({ key, url, at: new Date().toISOString() }),
    { httpMetadata: { contentType: "application/json" } },
  );
}

type Outcome = "linked" | "unlinked" | "held";

async function processOne(env: Env, c: Candidate): Promise<Outcome> {
  const maxBytes = Number(env.MAX_BYTES || 25165824);

  const obj = await env.ORIGINALS.get(c.key);
  if (!obj) {
    // 途中で消されたもの。追いかけても仕方がないので記録して終わる
    await quarantine(env, c.key, "原本が見つからない（削除済み）");
    return "held";
  }

  // ★Worker のメモリは 128MB★
  //   入力と出力の2本を同時に持つので、大きすぎるものは触らない。
  if (obj.size > maxBytes) {
    await quarantine(env, c.key, `サイズ超過 ${obj.size}B（上限 ${maxBytes}B）`);
    return "held";
  }

  const input = new Uint8Array(await obj.arrayBuffer());
  const format = detect(input);
  const result = sanitize(input);

  if (result.status !== "ok") {
    await quarantine(env, c.key, `${format}: ${result.reason}`);
    return "held";
  }

  await env.PUBLIC.put(c.key, result.out, {
    httpMetadata: {
      contentType: result.contentType,
      // キーは UUID で内容が変わらないため、恒久キャッシュでよい
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  const url = `${env.PUBLIC_BASE.replace(/\/+$/, "")}/${c.key}`;
  const res = await fetch(env.WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": env.WEBHOOK_SECRET,
      "User-Agent": "Wedding-Worker/1.0",
    },
    body: JSON.stringify({ key: c.key, bytes: result.out.length }),
  });

  if (res.status === 202) {
    // Firestore にまだ originalPath が無い。マーカーを書かずに次回へ回す。
    const ageH = (Date.now() - c.uploaded.getTime()) / 3_600_000;
    const giveUp = Number(env.UNLINKED_GIVEUP_HOURS || 24);
    if (ageH > giveUp) {
      await quarantine(env, c.key, `${Math.round(ageH)}時間 紐付け先が見つからない`);
      return "held";
    }
    console.log(`[wait] ${c.key} 紐付け先がまだありません`);
    return "unlinked";
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 一時的な障害の可能性があるので隔離はしない。例外にして次回やり直す。
    throw new Error(`webhook ${res.status}: ${body.slice(0, 200)}`);
  }

  await markLinked(env, c.key, url);
  console.log(
    `[ok] ${c.key} ${format} ${input.length}B → ${result.out.length}B ` +
      `(-${input.length - result.out.length}B, ${result.note})`,
  );
  return "linked";
}

async function runBatch(env: Env): Promise<Record<string, number>> {
  const max = Number(env.MAX_PER_RUN || 10);
  const candidates = (await collect(env)).slice(0, max);
  const tally: Record<string, number> = { linked: 0, unlinked: 0, held: 0, error: 0 };

  for (const c of candidates) {
    try {
      tally[await processOne(env, c)] += 1;
    } catch (e) {
      tally.error += 1;
      // マーカーを書かないので、次回の実行で自動的に再試行される
      console.error(`[error] ${c.key}`, e);
    }
  }

  console.log(
    `[run] 対象 ${candidates.length} 件 / ` +
      `完了 ${tally.linked} 待ち ${tally.unlinked} 隔離 ${tally.held} 失敗 ${tally.error}`,
  );
  return tally;
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runBatch(env));
  },

  /**
   * 手動実行用。Cron を待たずに確認したいときに使う。
   *   curl -X POST -H "x-worker-secret: <値>" https://<worker>.workers.dev/run
   */
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/run") return new Response("not found", { status: 404 });
    if (req.headers.get("x-worker-secret") !== env.WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
    const tally = await runBatch(env);
    return Response.json({ ok: true, ...tally });
  },
};
