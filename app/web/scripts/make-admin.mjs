#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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
const auth = getAuth();
const db = getFirestore();

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help") {
  console.log(`使い方:
  node scripts/make-admin.mjs --list
  node scripts/make-admin.mjs <uid>
  node scripts/make-admin.mjs --revoke <uid>`);
  process.exit(0);
}

if (args[0] === "--list") {
  const { users } = await auth.listUsers(50);
  users.sort((a, b) =>
    new Date(b.metadata.creationTime) - new Date(a.metadata.creationTime));

  console.log("");
  console.log("UID                            作成日時              admin  tags");
  console.log("-".repeat(88));
  for (const u of users) {
    const c = u.customClaims ?? {};
    const created = new Date(u.metadata.creationTime)
      .toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    console.log(
      `${u.uid.padEnd(30)} ${created.padEnd(21)} ${(c.admin ? "✓" : " ").padEnd(6)} ${(c.tags ?? []).join(",")}`,
    );
  }
  console.log("");
  process.exit(0);
}

const revoke = args[0] === "--revoke";
const uid = revoke ? args[1] : args[0];
if (!uid) {
  console.error("❌ UID を指定してください");
  process.exit(1);
}

const user = await auth.getUser(uid);
const prev = user.customClaims ?? {};
const prevTags = Array.isArray(prev.tags) ? prev.tags : [];
const tags = prevTags.length > 0 ? prevTags : ["all"];

const next = { ...prev, tags };
if (revoke) delete next.admin;
else next.admin = true;

await auth.setCustomUserClaims(uid, next);

await db.collection("guests").doc(uid).set(
  { claimsUpdatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
  { merge: true },
);

console.log("");
console.log(revoke ? "🔓 管理者を解除しました" : "🔑 管理者にしました");
console.log(`   uid  : ${uid}`);
console.log(`   tags : ${tags.join(", ")}`);
console.log(`   admin: ${next.admin === true}`);
console.log("");
console.log("→ ブラウザをリロードすればトークンが更新され /admin に入れます");
process.exit(0);
