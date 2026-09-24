#!/usr/bin/env node
/**
 * guests -> guestPrivate へ氏名系フィールドを移す移行スクリプト。
 *
 * ★3段階に分けてある★
 *   1) --copy   guests の氏名を guestPrivate へ「複製」する。guests は触らない。
 *               この時点では新旧どちらのコードでも動く（安全に先行実行できる）。
 *   2) （ここで新コードをデプロイして動作確認する）
 *   3) --purge  guests 側の氏名フィールドを削除する。戻れなくなるので最後。
 *
 *   --verify はいつでも実行してよい読み取り専用の確認。
 *
 * 既定はドライラン。実際に書くときだけ --apply を付ける。
 * 何度実行しても同じ結果になる（冪等）。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const HERE = dirname(fileURLToPath(import.meta.url));

/** 氏名系フィールド。guests から guestPrivate へ移す対象 */
const NAME_FIELDS = ["displayName", "realName", "kana", "lineDisplayName"];
const CHUNK = 400;

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
    return {
      credential: applicationDefault(),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    };
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

/** そのドキュメントから移すべき値だけを抜く。空文字は移さない */
export function pickNames(data) {
  const out = {};
  for (const f of NAME_FIELDS) {
    const v = data?.[f];
    if (typeof v === "string" && v.trim() !== "") out[f] = v;
  }
  return out;
}

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const mode = args.has("--purge") ? "purge" : args.has("--copy") ? "copy" : "verify";

if (args.has("--help") || args.size === 0) {
  console.log(`使い方:
  node scripts/migrate-pii.mjs --verify              現状を数えるだけ（読み取り専用）
  node scripts/migrate-pii.mjs --copy                複製のドライラン
  node scripts/migrate-pii.mjs --copy --apply        guests -> guestPrivate へ複製
  node scripts/migrate-pii.mjs --purge               削除のドライラン
  node scripts/migrate-pii.mjs --purge --apply       guests 側の氏名を削除（最後に実行）`);
  process.exit(0);
}

initializeApp(options());
const db = getFirestore();

const guests = await db.collection("guests").get();
console.log(`\nguests: ${guests.size} 件\n`);

if (mode === "verify") {
  const privSnaps = await db.collection("guestPrivate").get();
  const priv = new Map(privSnaps.docs.map((d) => [d.id, d.data()]));
  let leaking = 0, migrated = 0, missing = 0;
  const problems = [];
  for (const d of guests.docs) {
    const names = pickNames(d.data());
    const p = pickNames(priv.get(d.id) ?? {});
    if (Object.keys(names).length > 0) leaking += 1;
    if (Object.keys(p).length > 0) migrated += 1;
    for (const [k, v] of Object.entries(names)) {
      if (p[k] !== v) problems.push(`${d.id}: ${k} が未複製または不一致`);
    }
    if (Object.keys(names).length === 0 && Object.keys(p).length === 0) missing += 1;
  }
  console.log(`  guests に氏名が残っている    : ${leaking} 件  ← purge 後は 0 になる`);
  console.log(`  guestPrivate に氏名がある    : ${migrated} 件`);
  console.log(`  どちらにも氏名が無い         : ${missing} 件（LINE ログインのみ等）`);
  if (problems.length > 0) {
    console.log(`\n  ⚠ 未複製 ${problems.length} 件:`);
    for (const p of problems.slice(0, 20)) console.log(`    ${p}`);
    if (problems.length > 20) console.log(`    ...他 ${problems.length - 20} 件`);
    console.log(`\n  → node scripts/migrate-pii.mjs --copy --apply を先に実行してください`);
  } else if (leaking > 0) {
    console.log(`\n  ✅ 複製は完了しています。--purge --apply に進めます`);
  } else {
    console.log(`\n  ✅ 移行は完了しています`);
  }
  console.log("");
  process.exit(0);
}

const targets = [];
for (const d of guests.docs) {
  const names = pickNames(d.data());
  if (Object.keys(names).length > 0) targets.push({ id: d.id, names });
}

console.log(`${mode === "copy" ? "複製" : "削除"}対象: ${targets.length} 件`);
for (const t of targets.slice(0, 5)) {
  const preview = Object.entries(t.names).map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(`  ${t.id}  ${preview}`);
}
if (targets.length > 5) console.log(`  ...他 ${targets.length - 5} 件`);

if (!apply) {
  console.log(`\nドライランです。実行するには --apply を付けてください\n`);
  process.exit(0);
}

if (mode === "purge") {
  const privSnaps = await db.collection("guestPrivate").get();
  const priv = new Map(privSnaps.docs.map((d) => [d.id, d.data()]));
  const notCopied = targets.filter((t) => {
    const p = pickNames(priv.get(t.id) ?? {});
    return Object.entries(t.names).some(([k, v]) => p[k] !== v);
  });
  if (notCopied.length > 0) {
    console.error(`\n❌ 未複製が ${notCopied.length} 件あります。先に --copy --apply を実行してください`);
    for (const t of notCopied.slice(0, 10)) console.error(`   ${t.id}`);
    process.exit(1);
  }

  const backup = resolve(HERE, "..", `pii-backup-${Date.now()}.json`);
  writeFileSync(backup, JSON.stringify(targets, null, 2), "utf8");
  console.log(`\nバックアップ: ${backup}`);
  console.log("（このファイルには本名が入っています。確認後は必ず削除してください）");
}

let done = 0;
for (let i = 0; i < targets.length; i += CHUNK) {
  const batch = db.batch();
  for (const t of targets.slice(i, i + CHUNK)) {
    if (mode === "copy") {
      batch.set(
        db.collection("guestPrivate").doc(t.id),
        { uid: t.id, ...t.names, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    } else {
      const del = { updatedAt: FieldValue.serverTimestamp() };
      for (const k of Object.keys(t.names)) del[k] = FieldValue.delete();
      batch.set(db.collection("guests").doc(t.id), del, { merge: true });
    }
    done += 1;
  }
  await batch.commit();
  console.log(`  ${Math.min(i + CHUNK, targets.length)} / ${targets.length}`);
}

console.log(`\n✅ ${mode === "copy" ? "複製" : "削除"}完了: ${done} 件`);
console.log(`→ node scripts/migrate-pii.mjs --verify で確認してください\n`);
process.exit(0);
