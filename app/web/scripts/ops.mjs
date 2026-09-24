#!/usr/bin/env node
/**
 * 運用 CLI（メンテナンス切替・監査ログ閲覧・レートリミット状況）
 *
 *   node scripts/ops.mjs maintenance status
 *   node scripts/ops.mjs maintenance on "ただいまメンテナンス中です"
 *   node scripts/ops.mjs maintenance off
 *
 *   node scripts/ops.mjs audit                    直近50件
 *   node scripts/ops.mjs audit --limit 200
 *   node scripts/ops.mjs audit --action guest.    action の前方一致
 *   node scripts/ops.mjs audit --actor line:U...  実行者で絞り込み
 *   node scripts/ops.mjs audit --denied           権限違反だけ
 *   node scripts/ops.mjs audit --incomplete       開始だけで終了が無いもの
 *
 *   node scripts/ops.mjs ratelimit                直近の窓の使用状況
 *
 * 認証情報は scripts/make-admin.mjs と同じく app/web/.env.local から読む。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv(resolve(HERE, "..", ".env.local"));

function options() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const raw = b64
    ? Buffer.from(b64, "base64").toString("utf8")
    : process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return { credential: applicationDefault(), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID };
  }
  const sa = JSON.parse(raw);
  return {
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key.replace(/\\n/g, "\n"),
    }),
    projectId: sa.project_id,
  };
}

const [cmd, ...rest] = process.argv.slice(2);
function flag(name) {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}
const has = (name) => rest.includes(name);

if (!cmd || cmd === "--help") {
  console.log(`使い方:
  node scripts/ops.mjs maintenance status|on ["文言"]|off
  node scripts/ops.mjs audit [--limit N] [--action 前方一致] [--actor uid] [--denied] [--incomplete]
  node scripts/ops.mjs ratelimit`);
  process.exit(0);
}

initializeApp(options());
const db = getFirestore();

const jst = (ts) =>
  ts?.toDate?.().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false }) ?? "-";

// ---- maintenance ------------------------------------------------------------
if (cmd === "maintenance") {
  const ref = db.collection("config").doc("runtime");
  const sub = rest[0] ?? "status";
  if (sub === "on" || sub === "off") {
    const message = sub === "on" ? (rest[1] ?? "") : "";
    await ref.set(
      { maintenance: sub === "on", message, updatedAt: FieldValue.serverTimestamp(), updatedBy: "ops-cli" },
      { merge: true },
    );
    console.log(`\n${sub === "on" ? "🛑 メンテナンスを開始しました" : "✅ メンテナンスを解除しました"}`);
    console.log("   反映まで最大10秒（各サーバーのキャッシュ）。管理者と Worker の webhook は影響を受けません\n");
  }
  const snap = await ref.get();
  console.log(`maintenance : ${snap.get("maintenance") === true ? "ON" : "OFF"}`);
  console.log(`message     : ${snap.get("message") || "(既定の文言)"}`);
  console.log(`updatedAt   : ${jst(snap.get("updatedAt"))}\n`);
  process.exit(0);
}

// ---- audit ------------------------------------------------------------------
if (cmd === "audit") {
  const limit = Math.min(Number(flag("--limit") ?? 50), 1000);
  // 開始・終了・拒否をまとめて取り、requestId で突き合わせる
  const snap = await db.collection("auditLogs").orderBy("at", "desc").limit(limit * 3).get();
  const ends = new Map();
  const heads = [];
  for (const d of snap.docs) {
    const v = d.data();
    if (v.phase === "end") ends.set(v.requestId, v);
    else heads.push(v);
  }
  const action = flag("--action");
  const actor = flag("--actor");
  let rows = heads.filter(
    (v) =>
      (!action || String(v.action ?? "").startsWith(action)) &&
      (!actor || v.actorUid === actor) &&
      (!has("--denied") || v.phase === "denied"),
  );
  if (has("--incomplete")) rows = rows.filter((v) => v.phase === "begin" && !ends.has(v.requestId));
  rows = rows.slice(0, limit);

  console.log("");
  console.log("日時(JST)             結果      action                  実行者                          対象");
  console.log("-".repeat(120));
  for (const v of rows) {
    const end = ends.get(v.requestId);
    const result =
      v.phase === "denied" ? "DENIED" : end ? `${end.result}/${end.status}` : "未完了";
    console.log(
      [
        jst(v.at).padEnd(20),
        result.padEnd(9),
        String(v.action ?? "").padEnd(23),
        `${v.actorRole ?? "-"}:${v.actorUid ?? "-"}`.padEnd(31),
        v.targetId ?? "-",
      ].join(" "),
    );
    if (v.fields?.length) console.log(" ".repeat(31) + `項目: ${v.fields.join(", ")}`);
  }
  console.log(`\n${rows.length} 件（requestId で Sentry のイベントと突き合わせられます）\n`);
  process.exit(0);
}

// ---- ratelimit ---------------------------------------------------------------
if (cmd === "ratelimit") {
  // expiresAt は TTL 専用でインデックスを外しているので、並べ替えは window で行う
  const snap = await db.collection("rateLimits").orderBy("window", "desc").limit(300).get();
  const byBucket = new Map();
  for (const d of snap.docs) {
    const v = d.data();
    const cur = byBucket.get(v.bucket) ?? { keys: 0, max: 0, total: 0 };
    cur.keys += 1;
    cur.total += v.count ?? 0;
    cur.max = Math.max(cur.max, v.count ?? 0);
    byBucket.set(v.bucket, cur);
  }
  console.log("\nバケット                 キー数  合計回数  1キーの最大");
  console.log("-".repeat(60));
  for (const [b, s] of [...byBucket].sort((a, z) => z[1].total - a[1].total)) {
    console.log(`${String(b).padEnd(24)} ${String(s.keys).padStart(6)} ${String(s.total).padStart(9)} ${String(s.max).padStart(11)}`);
  }
  console.log("\n（直近 300 件の窓。uid や IP はハッシュ化されているので個人は特定できません）\n");
  process.exit(0);
}

console.error(`不明なコマンドです: ${cmd}（--help で使い方）`);
process.exit(1);
