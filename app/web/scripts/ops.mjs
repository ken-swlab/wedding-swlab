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
 *                                                 （写真の URL が JSON に無ければ、いまの値を引き継ぐ。Issue #173）
 *   node scripts/ops.mjs invitation photo set <hero|groom|bride> <画像ファイル>
 *                                                 写真を縮めて EXIF を消し、公開バケットに置いて URL を書き換える（Issue #173）。
 *                                                 アップロードは wrangler（オーナーの Cloudflare ログイン）。監査ログに残す
 *   node scripts/ops.mjs notify status            公式 LINE の通知のモード（config/runtime の lineNotify）と、アウトボックスの件数
 *   node scripts/ops.mjs notify mode <off|dryRun|adminsOnly|on>
 *                                                 通知のモードを変える（既定 off。約10秒で反映。監査ログに残す）
 *   node scripts/ops.mjs notify retry             失敗した通知（failed）を送信待ち（pending）に戻す。
 *                                                 送るのは管理画面の「送信待ちの通知を送る」（トークンは Vercel の本番にだけあるため）
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
  node scripts/ops.mjs invitation status|template|check <file>|set <file>|photo set <hero|groom|bride> <画像ファイル>
  node scripts/ops.mjs payment status|set [--party 円] [--second 円] [--car-fare 円]
  node scripts/ops.mjs notify status|mode <off|dryRun|adminsOnly|on>|retry`);
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
/**
 * ★リポジトリの中のファイルは受け付けない★ 本物の名前・写真をコミットしてしまう事故を防ぐ。
 *   what: エラーに出す「何を置くか」（例: 本物の値を入れた JSON）
 */
function outsideRepo(path, what) {
  const abs = resolve(process.cwd(), path);
  const repoRoot = resolve(HERE, "..", "..", "..");
  if (abs.startsWith(repoRoot + "/")) {
    console.error(`リポジトリの中のファイルは使えません。${what}は、リポジトリの外（ホームなど）に置いてください`);
    process.exit(1);
  }
  return abs;
}
function readInvitationFile(path) {
  if (!path) {
    console.error("JSON ファイルのパスを指定してください（例: node scripts/ops.mjs invitation set ~/invitation.json）");
    process.exit(1);
  }
  const abs = outsideRepo(path, "本物の値を入れた JSON");
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
/** 以前の項目（receptionAt・ceremony）を、JSON にあれば形だけ確かめて取り出す（Issue #166 の移行の間だけ） */
function readLegacyInvitationFields(path) {
  const data = JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
  const out = {};
  if (typeof data.receptionAt === "string" && data.receptionAt.trim()) out.receptionAt = data.receptionAt.trim().slice(0, 200);
  const c = data.ceremony;
  if (c && typeof c === "object" && typeof c.startAt === "string") {
    out.ceremony = { startAt: c.startAt, gatherAt: typeof c.gatherAt === "string" ? c.gatherAt : "", note: typeof c.note === "string" ? c.note.slice(0, 200) : "" };
  }
  return out;
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

// ---- notify（Issue #168）------------------------------------------------------
// 公式 LINE（Messaging API）からの通知。送信係は src/lib/line-notify-server.ts
if (cmd === "notify") {
  const MODES = ["off", "dryRun", "adminsOnly", "on"]; // src/lib/runtime-config.ts の LINE_NOTIFY_MODES と同じ
  const runtimeRef = db.collection("config").doc("runtime");
  const outbox = db.collection("lineOutbox");
  const sub = rest[0] ?? "status";

  /** ★監査ログに残す★（形は src/lib/audit.ts と同じ。値は残さず、項目の名前だけ）。保持は AUDIT_RETENTION_DAYS と同じ 400 日 */
  async function audit(action, targetId, fields) {
    const requestId = `ops-${randomUUID()}`;
    const expiresAt = Timestamp.fromMillis(Date.now() + 400 * 86_400_000);
    const route = `ops.notify.${sub}`;
    await db.collection("auditLogs").doc(`${requestId}-b`).create({
      requestId, route, method: "CLI", action, actorUid: "ops-cli", actorRole: "admin",
      targetId, fields, ipHash: null, userAgent: "scripts/ops.mjs",
      phase: "begin", at: FieldValue.serverTimestamp(), expiresAt,
    });
    await db.collection("auditLogs").doc(`${requestId}-e`).create({
      requestId, route, phase: "end", result: "success", status: 200, durationMs: 0,
      at: FieldValue.serverTimestamp(), expiresAt,
    });
  }

  if (sub === "mode") {
    const mode = rest[1];
    if (!MODES.includes(mode)) {
      console.error(`使い方: node scripts/ops.mjs notify mode <${MODES.join("|")}>`);
      process.exit(1);
    }
    await runtimeRef.set({ lineNotify: mode, updatedAt: FieldValue.serverTimestamp(), updatedBy: "ops-cli" }, { merge: true });
    await audit("notify.mode.set", "config/runtime", ["lineNotify"]);
    console.log(`\n✅ 通知のモードを ${mode} にしました（反映まで最大10秒。監査ログに残しました）`);
    console.log("   トークン（LINE_CHANNEL_ACCESS_TOKEN）が無い環境では、モードにかかわらず送りません\n");
  } else if (sub === "retry") {
    // ★失敗したものだけを送信待ちに戻す★ retryKey は変えない（LINE 側で重複が弾かれる）。送ったもの・送らなかったものは触らない
    const failed = await outbox.where("status", "==", "failed").limit(200).get();
    const batch = db.batch();
    for (const d of failed.docs) batch.update(d.ref, { status: "pending" });
    if (!failed.empty) await batch.commit();
    await audit("notify.retry.reset", "lineOutbox", ["status"]);
    console.log(`\n✅ 失敗した通知 ${failed.size} 件を送信待ちに戻しました（監査ログに残しました）`);
    console.log("   送るには、管理画面（/admin）の「送信待ちの通知を送る」を押してください\n");
  } else if (sub !== "status") {
    console.error("使い方: node scripts/ops.mjs notify status|mode <off|dryRun|adminsOnly|on>|retry");
    process.exit(1);
  }

  const runtime = await runtimeRef.get();
  const mode = runtime.get("lineNotify");
  console.log(`lineNotify : ${MODES.includes(mode) ? mode : "off（未設定）"}`);
  // ★件数だけ★ uid・宛先・エラーの詳細は出さない
  for (const status of ["pending", "sent", "failed", "skipped"]) {
    const n = (await outbox.where("status", "==", status).count().get()).data().count;
    console.log(`  ${status.padEnd(8)} : ${n} 件`);
  }
  console.log("");
  process.exit(0);
}

// ---- invitation の写真（Issue #173）--------------------------------------------
/** 写真の差し替え先。groom・bride は fromUs の何枚目か */
const PHOTO_TARGETS = { hero: null, groom: 0, bride: 1 };
/**
 * 縮める大きさ（px）。シルエットは長辺。ふたりからの写真は 4:5（画面では2列のカードの上に横幅いっぱい。約 160〜210px 幅）。
 * ★ふたりからの写真の縦横比は InvitationExtras.tsx の aspect-[4/5] とそろえる★ 違う比の写真は attention で切り抜く。
 */
const PHOTO_HERO_LONG_EDGE = 1200;
const PHOTO_FROM_US_WIDTH = 640;
const PHOTO_FROM_US_HEIGHT = 800;
const PHOTO_JPEG_QUALITY = 80;
/** ★公開バケットの中の置き場所★ ゲストの u/{uid}/ の外（投稿の削除・ownsKey() が触らない） */
const PHOTO_KEY_PREFIX = "site/invitation/";

/**
 * invitation set のとき、写真の URL が JSON に無ければ、いまの config/invitation の値を引き継ぐ。
 * ★photo set で入れた URL を、文言の変更で消さないため★ 消したいときは JSON に "" を書く。
 * 引き継いだ項目の名前を返す（値は出さない）。value は書き換える。
 */
function carryOverPhotoUrls(value, path, current) {
  if (!current) return [];
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
  const kept = [];
  const curHero = current.photos?.hero?.url;
  if (value.photos?.hero && raw.photos?.hero?.url === undefined && typeof curHero === "string" && curHero) {
    value.photos.hero.url = curHero;
    kept.push("photos.hero.url");
  }
  value.fromUs.forEach((card, i) => {
    const cur = Array.isArray(current.fromUs) ? current.fromUs[i]?.photoUrl : undefined;
    if (raw.fromUs?.[i]?.photoUrl === undefined && typeof cur === "string" && cur) {
      card.photoUrl = cur;
      kept.push(`fromUs.${i}.photoUrl`);
    }
  });
  // 引き継いだ値も同じ形の確認を通す（壊れた URL を持ち越さない）
  const parsed = parseInvitationConfig(value);
  if (!parsed.ok) {
    console.error(`引き継いだ写真の URL の形が違います（項目: ${parsed.field}）。JSON に URL を書いてやり直してください`);
    process.exit(1);
  }
  return kept;
}

/**
 * 写真を差し替える: 縮めて JPEG にし、EXIF（位置情報など）を消す → 公開バケットに推測できないキーで置く → URL を書き換える。
 * ★EXIF は sharp が既定で落とす★（withMetadata を呼ばない）。念のため書き出したものを読み直して、残っていたら止める。
 * ★アップロードは wrangler★ R2 の鍵を開発機のファイルに置かない（docs/security/secrets-inventory.md §4）。
 *   オーナーの Cloudflare のログイン（npx wrangler login）を使う。
 * ★古い写真は消さない★ 消すときはオーナーが Cloudflare のダッシュボードで消す（キーは出さない。status で有無だけ見る）。
 */
async function setInvitationPhoto(ref, action, target, file) {
  if (action !== "set" || !(target in PHOTO_TARGETS) || !file) {
    console.error("使い方: node scripts/ops.mjs invitation photo set <hero|groom|bride> <画像ファイル>");
    process.exit(1);
  }
  const abs = outsideRepo(file, "本物の写真");
  const base = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) {
    console.error("NEXT_PUBLIC_MEDIA_BASE（公開バケットの配信元。https://…）が .env.local にありません");
    process.exit(1);
  }
  const bucket = process.env.R2_BUCKET_PUBLIC || "wedding-media";

  // いまの設定に、差し替える先（alt など）があるか先に確かめる。URL 以外は invitation set で入れる
  const before = await ref.get();
  const parsedBefore = before.exists ? parseInvitationConfig(before.data()) : { ok: false, field: "(未設定)" };
  if (!parsedBefore.ok) {
    console.error(`config/invitation が未設定か、形が違います（項目: ${parsedBefore.field}）。先に invitation set で入れてください`);
    process.exit(1);
  }
  const index = PHOTO_TARGETS[target];
  if (index === null ? !parsedBefore.value.photos?.hero : !parsedBefore.value.fromUs[index]) {
    console.error(`${target === "hero" ? "photos.hero" : `fromUs.${index}`} がまだありません。先に invitation set で alt・文言を入れてください`);
    process.exit(1);
  }

  const sharp = (await import("sharp")).default;
  let img = sharp(abs, { failOn: "error" }).rotate(); // 向き（EXIF の Orientation）を画素に反映してから EXIF を落とす
  img = index === null
    ? img.resize({ width: PHOTO_HERO_LONG_EDGE, height: PHOTO_HERO_LONG_EDGE, fit: "inside", withoutEnlargement: true })
    : img.resize({ width: PHOTO_FROM_US_WIDTH, height: PHOTO_FROM_US_HEIGHT, fit: "cover", position: "attention" });
  let out;
  try {
    out = await img.jpeg({ quality: PHOTO_JPEG_QUALITY, mozjpeg: true }).toBuffer();
  } catch {
    console.error("画像として読めませんでした（JPEG・PNG・WebP・HEIC などの画像ファイルを指定してください）");
    process.exit(1);
  }
  const meta = await sharp(out).metadata();
  if (meta.exif || meta.xmp || meta.iptc) {
    console.error("EXIF などのメタデータを消せませんでした。アップロードを中止します");
    process.exit(1);
  }

  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const key = `${PHOTO_KEY_PREFIX}${randomUUID()}.jpg`;
  const dir = mkdtempSync(resolve(tmpdir(), "invitation-photo-"));
  const tmp = resolve(dir, "photo.jpg");
  writeFileSync(tmp, out);
  try {
    // wrangler は Worker のディレクトリにある（infra/workers/exif-stripper の devDependencies）
    const r = spawnSync(
      "npx",
      ["--no-install", "wrangler", "r2", "object", "put", `${bucket}/${key}`, "--file", tmp, "--content-type", "image/jpeg",
        "--cache-control", "public, max-age=31536000, immutable", "--remote"],
      { cwd: resolve(HERE, "..", "..", "..", "infra", "workers", "exif-stripper"), stdio: ["ignore", "ignore", "inherit"] },
    );
    if (r.status !== 0) {
      console.error("アップロードに失敗しました（npx wrangler login でログインしてから、やり直してください）");
      process.exit(1);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // ★URL だけを書き換える★ ほかの項目は触らない。書き込む前に、もう一度形を確かめる
  const url = `${base}/${key}`;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    if (index === null) data.photos.hero.url = url;
    else data.fromUs[index].photoUrl = url;
    const parsed = parseInvitationConfig(data);
    if (!parsed.ok) throw new Error(`形が違います（項目: ${parsed.field}）`);
    tx.set(ref, { ...data, updatedAt: FieldValue.serverTimestamp(), updatedBy: "ops-cli" });
  });

  // ★監査ログに残す★（形は src/lib/audit.ts と同じ。値・URL は残さず、項目の名前だけ）。保持は AUDIT_RETENTION_DAYS と同じ 400 日
  const requestId = `ops-${randomUUID()}`;
  const expiresAt = Timestamp.fromMillis(Date.now() + 400 * 86_400_000);
  const route = "ops.invitation.photo.set";
  const field = index === null ? "photos.hero.url" : `fromUs.${index}.photoUrl`;
  await db.collection("auditLogs").doc(`${requestId}-b`).create({
    requestId, route, method: "CLI", action: "invitation.photo.set", actorUid: "ops-cli", actorRole: "admin",
    targetId: "config/invitation", fields: [field], ipHash: null, userAgent: "scripts/ops.mjs",
    phase: "begin", at: FieldValue.serverTimestamp(), expiresAt,
  });
  await db.collection("auditLogs").doc(`${requestId}-e`).create({
    requestId, route, phase: "end", result: "success", status: 200, durationMs: 0,
    at: FieldValue.serverTimestamp(), expiresAt,
  });
  console.log(`\n✅ ${field} を差し替えました（${meta.width}×${meta.height}px・JPEG・EXIF なし。監査ログに残しました）`);
  console.log("   反映まで最大60秒（各サーバーのキャッシュ）。前の写真は公開バケットに残っています\n");
}

// ---- invitation -------------------------------------------------------------
if (cmd === "invitation") {
  const ref = db.collection("config").doc("invitation");
  const sub = rest[0] ?? "status";
  if (sub === "set") {
    const value = readInvitationFile(rest[1]);
    /**
     * ★移行の間だけ、以前の receptionAt・ceremony も書く★（Issue #166）
     *   #166 より前の本番のコードは receptionAt を必須にしている。program を足した JSON を、マージより前に入れても
     *   招待状が「準備中」にならないよう、JSON にあればそのまま残す（新しいコードは読まずに捨てる）。
     *   #166 が本番に出たあとは、JSON から消して set し直す。消したら、この処理も消してよい。
     */
    const legacy = readLegacyInvitationFields(rest[1]);
    const kept = carryOverPhotoUrls(value, rest[1], (await ref.get()).data());
    // ★丸ごと置き換える★（merge しない）。古い項目を残さない
    await ref.set({ ...value, ...legacy, updatedAt: FieldValue.serverTimestamp(), updatedBy: "ops-cli" });
    if (kept.length > 0) console.log(`\n（写真の URL は JSON に無かったので、いまの値を引き継ぎました: ${kept.join("・")}）`);
    if (Object.keys(legacy).length > 0) console.log(`\n（移行用に ${Object.keys(legacy).join("・")} も残しました。#166 が本番に出たら、JSON から消して set し直してください）`);
    console.log("\n✅ config/invitation を更新しました");
    console.log("   反映まで最大60秒（各サーバーのキャッシュ）\n");
  } else if (sub === "photo") {
    await setInvitationPhoto(ref, rest[1], rest[2], rest[3]);
  } else if (sub !== "status") {
    console.error("使い方: node scripts/ops.mjs invitation status|template|check <file>|set <file>|photo set <hero|groom|bride> <画像ファイル>");
    process.exit(1);
  }
  const snap = await ref.get();
  if (!snap.exists) {
    console.log("config/invitation : 未設定（招待状は「準備中」と表示されます）\n");
    process.exit(0);
  }
  const parsed = parseInvitationConfig(snap.data());
  console.log(`config/invitation : ${parsed.ok ? "設定済み（形は正しい）" : `形が違います（項目: ${parsed.field}）→ 招待状は「準備中」と表示されます`}`);
  // ★値は出さない★ 行数と、挙式の選択肢に使う役目（role）が揃っているかだけ（Issue #166・#167）
  if (parsed.ok) {
    const roles = new Set(parsed.value.program.map((r) => r.role).filter(Boolean));
    const lacking = ["gather", "ceremony", "reception", "party"].filter((r) => !roles.has(r));
    const v = parsed.value;
    const set = (url) => (url ? "あり" : "なし");
    console.log(`写真              : シルエット ${set(v.photos?.hero?.url)}・ふたりから ${v.fromUs.map((c) => set(c.photoUrl)).join("／") || "（カードなし）"}`);
    console.log(`ふたりから        : ${v.fromUs.length} 枚 ／ 当日のおたのしみ: ${v.highlights.length} 枚 ／ ご挨拶: ${v.showGreeting ? "出す" : "出さない"}`);
    console.log(`program           : ${parsed.value.program.length} 行（role ${lacking.length ? `なし: ${lacking.join(", ")}。挙式の選択肢にその時刻が出ません` : "すべてあり"}）`);
  }
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
