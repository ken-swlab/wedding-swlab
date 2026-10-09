#!/usr/bin/env node
/**
 * 開発用ログイン（Issue #83）: Firebase エミュレーター + 初期データ + next dev をまとめて起動する。
 *   npm run dev:emulator   （app/web で実行）
 *
 * firebase emulators:exec が Auth（9099）と Firestore（8080）のエミュレーターを立ち上げ、
 * FIREBASE_AUTH_EMULATOR_HOST・FIRESTORE_EMULATOR_HOST・GCLOUD_PROJECT を付けて中のコマンドを実行する。
 * Firestore の Rules はリポジトリの infra/firestore/firestore.rules をそのまま使う（firebase.json）。
 * データは終了時に .firebase-emulator/ へ保存し、次の起動で読み戻す（Git には入れない）。
 *
 * ★firebase deploy は使わない（CLAUDE.md のルール 8）★ ここで使うのはエミュレーターだけ。
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = resolve(WEB, "..", "..", "firebase.json");
const DATA = resolve(WEB, ".firebase-emulator");
// src/config/emulator.ts の EMULATOR_PROJECT_ID と同じ値（demo- で始めること）
const PROJECT_ID = "demo-wedding";

function has(cmd, args) {
  return spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
}
if (!has("java", ["-version"])) {
  console.error("Firestore エミュレーターには Java（21 以上）が要ります。sudo apt-get install -y openjdk-21-jre-headless で入れてください");
  process.exit(1);
}
if (!has("firebase", ["--version"])) {
  console.error("firebase コマンドがありません。npm install -g firebase-tools で入れてください");
  process.exit(1);
}

const args = [
  "emulators:exec",
  "--config", CONFIG,
  "--project", PROJECT_ID,
  "--only", "auth,firestore",
  "--ui",
  ...(existsSync(resolve(DATA, "firebase-export-metadata.json")) ? ["--import", DATA] : []),
  "--export-on-exit", DATA,
  "node scripts/emulator-seed.mjs && next dev",
];

const child = spawn("firebase", args, {
  cwd: WEB,
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_FIREBASE_EMULATOR: "1" },
});
// Ctrl+C は firebase にも届き、データを保存してから終わる。こちらは先に抜けずに待つ
process.on("SIGINT", () => {});
child.on("exit", (code) => process.exit(code ?? 0));
