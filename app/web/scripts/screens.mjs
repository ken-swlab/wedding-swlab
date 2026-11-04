#!/usr/bin/env node
/**
 * 小さい画面のスクショを一通り撮る（Issue #230）。
 *   npm run test:screens                       … 全部の場面 × 全部の画面の大きさ
 *   npm run test:screens -- --only timeline,composer --viewports se,narrow
 *
 * 新しい Firebase エミュレーター（Auth・Firestore。データは毎回まっさら）を立ち上げ、初期データ（emulator-seed.mjs）を入れてから、
 * screens-capture.mjs が next dev（3100 番）を起動して Playwright で撮る。出力は app/web/screenshots/（Git には入れない）。
 *
 * ★本番にはつながない★ エミュレーターのプロジェクトは demo-（emulator-seed.mjs が確かめる）。データは架空の名前と図形の画像だけ。
 * ★dev:emulator と同時には動かせない★ エミュレーターのポート（8080・9099）が同じ。データの保存（.firebase-emulator/）には触らない。
 * ★firebase deploy は使わない（CLAUDE.md のルール 8）★
 * 要るもの: Java 21・firebase-tools（dev:emulator と同じ）・Playwright（npm の依存には足さない。手元に入っているものを使う）。
 */
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = resolve(WEB, "..", "..", "firebase.json");
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

const passArgs = process.argv.slice(2).map((a) => JSON.stringify(a)).join(" ");
const child = spawn(
  "firebase",
  ["emulators:exec", "--config", CONFIG, "--project", PROJECT_ID, "--only", "auth,firestore", `node scripts/emulator-seed.mjs && node scripts/screens-capture.mjs ${passArgs}`],
  { cwd: WEB, stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_FIREBASE_EMULATOR: "1" } },
);
child.on("exit", (code) => process.exit(code ?? 0));
