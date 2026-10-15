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
 *   node scripts/ops.mjs invitation status        招待状の設定（config/invitation）があるか・形が正しいか
 *   node scripts/ops.mjs invitation template      書き方の見本（架空の値の JSON）を出す
 *   node scripts/ops.mjs invitation check <file>  JSON ファイルの形だけ確かめる（書き込まない）
 *   node scripts/ops.mjs invitation set <file>    JSON ファイルの内容を config/invitation に入れる
 *   node scripts/ops.mjs payment status           会費の金額（config/payment）を出す
 *   node scripts/ops.mjs payment set --party 20000 --second 5000 --car-fare 10000
 *                                                 会費の金額を変える（指定しない項目は今の値のまま。監査ログに残す）
 *     ★本物の名前・日付・会場を入れた JSON はリポジトリの外に置く★（公開リポジトリ。コミットしない）
 *     ★このコマンドは値を画面に出さない★ 出すのは項目の名前と件数だけ。
 *
 * 認証情報は scripts/make-admin.mjs と同じく app/web/.env.local から読む。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

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
  node scripts/ops.mjs ratelimit
  node scripts/ops.mjs invitation status|template|check <file>|set <file>
  node scripts/ops.mjs payment status|set [--party 円] [--second 円] [--car-fare 円]`);
  process.exit(0);
}

// ---- invitation（Firestore に触れないもの）---------------------------------------
//   template と check は接続せずに終わる（認証情報が無くても使える）
// 形の確認はサーバー（src/lib/invitation-server.ts）と同じもの。Node が .ts の型だけ落として読み込む（Node 22.18 以上）。
// ★読み込むのは invitation のときだけ★ 古い Node でも、メンテナンスの切り替え（インシデント対応）は動くようにしておく
const parseInvitationConfig =
  cmd === "invitation" ? (await import("../src/lib/invitation-config.ts")).parseInvitationConfig : null;
const parsePaymentConfig =
  cmd === "payment" ? (await import("../src/lib/payment-config.ts")).parsePaymentConfig : null;
function readInvitationFile(path) {
  if (!path) {
    console.error("JSON ファイルのパスを指定してください（例: node scripts/ops.mjs invitation set ~/invitation.json）");
    process.exit(1);
  }
  const abs = resolve(process.cwd(), path);
  // ★リポジトリの中の JSON は受け付けない★ 本物の名前をコミットしてしまう事故を防ぐ
  const repoRoot = resolve(HERE, "..", "..", "..");
  if (abs.startsWith(repoRoot + "/")) {
    console.error("リポジトリの中のファイルは使えません。本物の値を入れた JSON は、リポジトリの外（ホームなど）に置いてください");
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    console.error("JSON として読めませんでした（ファイルの有無と、カンマ・引用符を確かめてください）");
    process.exit(1);
  }
  const parsed = parseInvitationConfig(data);
  if (!parsed.ok) {
    console.error(`形が違います。項目: ${parsed.field}（見本: node scripts/ops.mjs invitation template）`);
    process.exit(1);
  }
  return parsed.value;
}
if (cmd === "invitation" && rest[0] === "template") {
  console.log(readFileSync(resolve(HERE, "..", "src", "config", "invitation-sample.json"), "utf8"));
  process.exit(0);
}
if (cmd === "invitation" && rest[0] === "check") {
  const v = readInvitationFile(rest[1]);
  console.log(`✅ 形は正しいです（ご挨拶 ${v.greeting.length} 行、名前の表記 ${Object.keys(v.opening.names).length} 通り）。書き込みはしていません`);
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

// ---- invitation -------------------------------------------------------------
if (cmd === "invitation") {
  const ref = db.collection("config").doc("invitation");
  const sub = rest[0] ?? "status";
  if (sub === "set") {
    const value = readInvitationFile(rest[1]);
    // ★丸ごと置き換える★（merge しない）。古い項目を残さない
    await ref.set({ ...value, updatedAt: FieldValue.serverTimestamp(), updatedBy: "ops-cli" });
    console.log("\n✅ config/invitation を更新しました");
    console.log("   反映まで最大60秒（各サーバーのキャッシュ）\n");
  } else if (sub !== "status") {
    console.error("使い方: node scripts/ops.mjs invitation status|template|check <file>|set <file>");
    process.exit(1);
  }
  const snap = await ref.get();
  if (!snap.exists) {
    console.log("config/invitation : 未設定（招待状は「準備中」と表示されます）\n");
    process.exit(0);
  }
  const parsed = parseInvitationConfig(snap.data());
  console.log(`config/invitation : ${parsed.ok ? "設定済み（形は正しい）" : `形が違います（項目: ${parsed.field}）→ 招待状は「準備中」と表示されます`}`);
  console.log(`updatedAt         : ${jst(snap.get("updatedAt"))}\n`);
  process.exit(0);
}

// ---- payment（Issue #148）-----------------------------------------------------
// 会費の金額。サーバー（src/lib/payment-server.ts）が60秒キャッシュして、招待状の会費と会費タブの内訳に使う
if (cmd === "payment") {
  const ref = db.collection("config").doc("payment");
  const sub = rest[0] ?? "status";
  const yen = (n) => `${n.toLocaleString("ja-JP")}円`;
  if (sub === "set") {
    const flags = { partyYen: "--party", secondYen: "--second", carFareYen: "--car-fare" };
    const current = (await ref.get()).data() ?? {};
    const next = {};
    const changed = [];
    for (const [key, name] of Object.entries(flags)) {
      const raw = flag(name);
      if (raw === undefined) {
        next[key] = current[key];
        continue;
      }
      if (!/^\d+$/.test(raw)) {
        console.error(`${name} は 0 以上の整数（円）で指定してください`);
        process.exit(1);
      }
      next[key] = Number(raw);
      changed.push(key);
    }
    if (changed.length === 0) {
      console.error("変える金額を指定してください（例: node scripts/ops.mjs payment set --party 20000 --second 5000 --car-fare 10000）");
      process.exit(1);
    }
    const parsed = parsePaymentConfig(next);
    if (!parsed.ok) {
      console.error(`形が違います。項目: ${parsed.field}（初回は3つとも指定してください）`);
      process.exit(1);
    }
    await ref.set({ ...parsed.value, updatedAt: FieldValue.serverTimestamp(), updatedBy: "ops-cli" });

    /**
     * ★変更を監査ログに残す★（Issue #148）。形は src/lib/audit.ts と同じ（開始と終了の2件を create()）。
     *   値は残さず、変えた項目の名前だけ。実行者は ops-cli（サービスアカウントの鍵を持つオーナー）。
     * ★保持日数は AUDIT_RETENTION_DAYS（src/lib/audit.ts）と同じ 400 日★ 片方だけ変えない。
     */
    const requestId = `ops-${randomUUID()}`;
    const expiresAt = Timestamp.fromMillis(Date.now() + 400 * 86_400_000);
    const route = "ops.payment.set";
    await db.collection("auditLogs").doc(`${requestId}-b`).create({
      requestId, route, method: "CLI", action: "payment.config.set", actorUid: "ops-cli", actorRole: "admin",
      targetId: "config/payment", fields: changed.sort(), ipHash: null, userAgent: "scripts/ops.mjs",
      phase: "begin", at: FieldValue.serverTimestamp(), expiresAt,
    });
    await db.collection("auditLogs").doc(`${requestId}-e`).create({
      requestId, route, phase: "end", result: "success", status: 200, durationMs: 0,
      at: FieldValue.serverTimestamp(), expiresAt,
    });
    console.log("\n✅ config/payment を更新しました（監査ログに残しました）");
    console.log("   反映まで最大60秒（各サーバーのキャッシュ）\n");
  } else if (sub !== "status") {
    console.error("使い方: node scripts/ops.mjs payment status|set [--party 円] [--second 円] [--car-fare 円]");
    process.exit(1);
  }
  const snap = await ref.get();
  if (!snap.exists) {
    console.log("config/payment : 未設定（招待状に会費を出さず、会費タブは「準備中」になります）\n");
    process.exit(0);
  }
  const parsed = parsePaymentConfig(snap.data());
  if (!parsed.ok) {
    console.log(`config/payment : 形が違います（項目: ${parsed.field}）\n`);
    process.exit(0);
  }
  const v = parsed.value;
  console.log(`会食（1次会）: ${yen(v.partyYen)}`);
  console.log(`2次会       : ${yen(v.secondYen)}`);
  console.log(`お車代      : ${yen(v.carFareYen)}（差し引く額。招待状には出さない）`);
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
