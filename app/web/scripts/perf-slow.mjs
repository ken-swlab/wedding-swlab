#!/usr/bin/env node
/**
 * 遅い回線での起動の速さを測る（Issue #250）。
 *   npm run perf:slow                  … 2 つの回線（遅い 4G・電車の悪い所）で、それぞれ 3 回測って中央値を出す
 *   npm run perf:slow -- --runs 5      … 回数を変える
 *   npm run perf:slow -- --label after … 結果のファイル名に付ける名前（直す前／後の比較用）
 *
 * 新しい Firebase エミュレーター（データは毎回まっさら）に初期データを入れ、perf-capture.mjs が next dev（3200 番）を起動して
 * Playwright（Chromium）の CDP で回線を絞って測る。出力は app/web/screenshots/perf/（Git には入れない）。
 *
 * ★開発サーバーで測る★（オーナーの判断）エミュレーターと開発用ログインは本番のビルドでは動かない作り（lib/emulator.ts）のため。
 *   開発用の JS は圧縮されないので、秒数・量は本番より大きく出る。直す前と後を同じ条件で比べるためのもの。
 *   本番の JS の大きさは next analyze（Turbopack の解析）で別に見る。
 * ★本番にはつながない★ エミュレーターのプロジェクトは demo-。写真は測定のたびに作る架空の画像（public/perf-samples。Git には入れない）。
 * ★dev:emulator・test:screens と同時には動かせない★（エミュレーターのポートが同じ）
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
  console.error("Firestore エミュレーターには Java（21 以上）が要ります");
  process.exit(1);
}
if (!has("firebase", ["--version"])) {
  console.error("firebase コマンドがありません。npm install -g firebase-tools で入れてください");
  process.exit(1);
}

const passArgs = process.argv.slice(2).map((a) => JSON.stringify(a)).join(" ");
const child = spawn(
  "firebase",
  ["emulators:exec", "--config", CONFIG, "--project", PROJECT_ID, "--only", "auth,firestore", `node scripts/emulator-seed.mjs && node scripts/perf-capture.mjs ${passArgs}`],
  { cwd: WEB, stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_FIREBASE_EMULATOR: "1" } },
);
child.on("exit", (code) => process.exit(code ?? 0));
