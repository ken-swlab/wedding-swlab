#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

initializeApp(options());
const db = getFirestore();

const dryRun = process.argv.includes("--dry-run");
const PAGE = 300;

let scanned = 0;
let pending = 0;
let skipped = 0;
let untouched = 0;
let cursor = null;

console.log(dryRun ? "\n🔍 dry-run（書き込みません）\n" : "\n✍️  マイグレーションを実行します\n");

for (;;) {
  let q = db.collection("posts").orderBy("__name__").limit(PAGE);
  if (cursor) q = q.startAfter(cursor);

  const snap = await q.get();
  if (snap.empty) break;

  const batch = db.batch();
  let writes = 0;

  for (const doc of snap.docs) {
    scanned += 1;
    const data = doc.data();

    if (data.faceDetectionStatus !== undefined) {
      untouched += 1;
      continue;
    }

    const media = Array.isArray(data.media) ? data.media : [];
    const hasImage = media.some((m) => m?.type === "image" && typeof m?.url === "string");
    const status = hasImage ? "pending" : "skipped";

    if (hasImage) pending += 1;
    else skipped += 1;

    if (!dryRun) {
      batch.update(doc.ref, { faceDetectionStatus: status });
      writes += 1;
    }
  }

  if (!dryRun && writes > 0) await batch.commit();

  cursor = snap.docs[snap.docs.length - 1];
  process.stdout.write(`\r  走査 ${scanned} 件…`);
  if (snap.size < PAGE) break;
}

console.log("\n");
console.log("────────────────────────────");
console.log(`  走査した投稿      : ${scanned}`);
console.log(`  pending  に設定   : ${pending}`);
console.log(`  skipped  に設定   : ${skipped}`);
console.log(`  既設定のため放置  : ${untouched}`);
console.log("────────────────────────────");
