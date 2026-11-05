#!/usr/bin/env node
/**
 * perf-slow.mjs から呼ばれる（エミュレーターが立ち上がった中で動く）。遅い回線でゲストブックを開く速さを測る（Issue #250）。
 *
 * 流れ:
 *   1. 本番と同じくらいの大きさの見本の写真（JPEG・長辺 1920px・品質 0.8 相当）を public/perf-samples に作り、
 *      エミュレーターの見本の投稿の写真をそれに差し替える（public/perf-samples は Git に入れない）。
 *   2. next dev（3200 番）を起動し、回線を絞らずに一度開いて、開発サーバーの組み立て（コンパイル）を済ませておく。
 *   3. テスト用のゲストで入ったまま（ログインは端末に残る＝ログイン済みで開く場合）、回線を絞り、キャッシュを使わずに
 *      /guestbook を開き直して測る。回線ごとに --runs 回（既定 3 回）測り、中央値を出す。
 *
 * 測るもの:
 *   - 最初の描画（FCP）: 何かが画面に出るまで（スプラッシュを含む）
 *   - 枠が出るまで: ゲストブックの下のタブが出るまで
 *   - 最初の投稿が見えるまで: 最初の投稿の本文が出るまで
 *   - 最初の写真が見えるまで: 最初の投稿の写真を読み終わるまで
 *   - 通信量（MB）と JS の量（KB）: 最初の投稿が見えるまでに受け取った分（圧縮後の量）
 * ★開発サーバーなので、JS は本番より大きい★ 直す前と後を同じ条件で比べるためのもの（perf-slow.mjs の★参照）。
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(WEB, "screenshots", "perf");
const SAMPLES = resolve(WEB, "public", "perf-samples");
const PORT = 3200;
const BASE = `http://localhost:${PORT}`;
const require = createRequire(import.meta.url);

/** 回線（Issue #250）。throughput は バイト/秒 */
const PROFILES = [
  { key: "slow4g", label: "遅い 4G（下り 1.6Mbps・往復 300ms）", latency: 300, down: (1.6 * 1e6) / 8, up: (0.75 * 1e6) / 8 },
  { key: "train", label: "電車の悪い所（下り 400kbps・往復 600ms）", latency: 600, down: (0.4 * 1e6) / 8, up: (0.2 * 1e6) / 8 },
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const RUNS = Number(arg("runs", "3"));
const LABEL = arg("label", "result");
const TIMEOUT_MS = 180_000;

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright が見つかりません（npm の依存には足していません。手元に入っているものを使います）");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1. 見本の写真 ----
/**
 * 本番の軽量版（lib/image.ts。長辺 1920px・JPEG 品質 0.8）に近い大きさの画像を作る。
 * ★ノイズを少しぼかした画像★ 単色や図形だと JPEG が小さくなりすぎ、本物の写真の重さにならない。
 */
async function makeSamples() {
  const sharp = require("sharp");
  mkdirSync(SAMPLES, { recursive: true });
  const sizes = [
    [1920, 1440],
    [1440, 1920],
    [1920, 1440],
    [1920, 1920],
  ];
  const out = [];
  for (const [i, [w, h]] of sizes.entries()) {
    const raw = Buffer.alloc(w * h * 3);
    let seed = 12345 + i;
    for (let p = 0; p < raw.length; p++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      raw[p] = (seed >> 16) & 0xff;
    }
    const file = resolve(SAMPLES, `photo-${i + 1}.jpg`);
    const info = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).blur(1.6).jpeg({ quality: 80 }).toFile(file);
    out.push({ url: `/perf-samples/photo-${i + 1}.jpg`, width: w, height: h, bytes: info.size });
  }
  return out;
}

/** エミュレーターの見本の投稿の写真を差し替え、承認後の演出を見たことにする（測定のじゃまにならないよう） */
async function prepareData(samples) {
  const { initializeApp } = require("firebase-admin/app");
  const { getFirestore, FieldValue } = require("firebase-admin/firestore");
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("エミュレーターの中で動かしてください（npm run perf:slow）");
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-wedding" });
  const db = getFirestore();
  const posts = await db.collection("posts").get();
  let k = 0;
  for (const d of posts.docs) {
    const media = d.get("media");
    if (!Array.isArray(media) || media.length === 0) continue;
    const next = media.map((m) => {
      const s = samples[k++ % samples.length];
      return { ...m, type: "image", url: s.url, storagePath: "", width: s.width, height: s.height };
    });
    await d.ref.update({ media: next });
  }
  await db.collection("guestPrivate").doc("dev:guest").set({ welcomeSeenAt: FieldValue.serverTimestamp() }, { merge: true });
}

// ---- 2. next dev ----
const next = spawn(resolve(WEB, "node_modules/.bin/next"), ["dev", "-p", String(PORT)], { cwd: WEB, stdio: ["ignore", "pipe", "pipe"], env: process.env, detached: true });
function stopNext() {
  try {
    process.kill(-next.pid, "SIGTERM");
  } catch {
    /* もう止まっている */
  }
}
next.stdout.on("data", () => {});
next.stderr.on("data", (d) => process.stderr.write(d));
async function waitUp() {
  for (let i = 0; i < 180; i++) {
    try {
      const r = await fetch(`${BASE}/dev/preview`);
      if (r.ok) return;
    } catch {
      /* まだ起動していない */
    }
    await sleep(1000);
  }
  throw new Error("next dev が起動しませんでした");
}

// ---- 3. 測る ----
/** 1 回測る。ログイン済みのコンテキストで、新しいタブを開いて /guestbook を開く */
async function measure(ctx, profile) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.clearBrowserCache");
  if (profile) {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.down,
      uploadThroughput: profile.up,
    });
  }
  // 受け取った量（圧縮後）。ストリーム（Firestore の購読）は終わらないので、届いた分を足していく
  const bytes = new Map();
  const types = new Map();
  let frozen = null;
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
  cdp.on("Network.dataReceived", (e) => {
    if (frozen) return;
    bytes.set(e.requestId, (bytes.get(e.requestId) ?? 0) + e.encodedDataLength);
  });
  cdp.on("Network.loadingFinished", (e) => {
    if (frozen) return;
    bytes.set(e.requestId, Math.max(bytes.get(e.requestId) ?? 0, e.encodedDataLength));
  });
  const total = () => {
    let all = 0;
    let js = 0;
    for (const [id, n] of bytes) {
      all += n;
      if (types.get(id) === "Script") js += n;
    }
    return { all, js };
  };

  await page.goto(`${BASE}/guestbook`, { waitUntil: "commit", timeout: TIMEOUT_MS });
  // 枠（下のタブ）→ 最初の投稿の本文 → 最初の投稿の写真。時刻はページの読み込み開始からのミリ秒
  const shell = await page.waitForFunction(() => document.querySelector('nav a[href="/guestbook/settings"]') && performance.now(), null, { timeout: TIMEOUT_MS, polling: "raf" }).then((h) => h.jsonValue());
  const post = await page.waitForFunction(() => {
    const card = document.querySelector("[data-post-card]");
    return card && card.textContent.trim().length > 0 && card.getBoundingClientRect().height > 0 && performance.now();
  }, null, { timeout: TIMEOUT_MS, polling: "raf" }).then((h) => h.jsonValue());
  const atPost = total();
  const photo = await page.waitForFunction(() => {
    const img = [...document.querySelectorAll("[data-post-card] img")].find((i) => i.getBoundingClientRect().height > 0);
    return img && img.complete && img.naturalWidth > 0 && performance.now();
  }, null, { timeout: TIMEOUT_MS, polling: "raf" }).then((h) => h.jsonValue());
  const atPhoto = total();
  frozen = true;
  const fcp = await page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null);
  await page.close();
  return { fcp, shell, post, photo, bytesAtPost: atPost.all, jsAtPost: atPost.js, bytesAtPhoto: atPhoto.all };
}

const median = (xs) => {
  const s = [...xs].filter((x) => typeof x === "number").sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const sec = (ms) => (ms == null ? "–" : (ms / 1000).toFixed(2));
const mb = (b) => (b / 1e6).toFixed(2);
const kb = (b) => Math.round(b / 1e3).toString();

async function main() {
  const samples = await makeSamples();
  console.log(`見本の写真: ${samples.map((s) => `${Math.round(s.bytes / 1e3)}KB`).join("・")}`);
  await prepareData(samples);
  await waitUp();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ja-JP" });
  // テスト用のゲストで入る（見本ページが入ってから /guestbook へ移す）。ログインは端末（IndexedDB）に残る
  const login = await ctx.newPage();
  await login.goto(`${BASE}/dev/preview?screen=timeline`, { timeout: TIMEOUT_MS });
  await login.waitForURL((u) => u.pathname !== "/dev/preview", { timeout: TIMEOUT_MS });
  await login.close();
  // 開発サーバーの組み立てを済ませる（回線を絞らずに 2 回）
  for (let i = 0; i < 2; i++) await measure(ctx, null);

  const rows = [];
  for (const profile of PROFILES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await measure(ctx, profile);
      runs.push(r);
      console.log(`  ${profile.key} #${i + 1}: 投稿 ${sec(r.post)}s・写真 ${sec(r.photo)}s・${mb(r.bytesAtPost)}MB`);
    }
    const m = (k) => median(runs.map((r) => r[k]));
    rows.push({ profile: profile.label, fcp: m("fcp"), shell: m("shell"), post: m("post"), photo: m("photo"), bytesAtPost: m("bytesAtPost"), jsAtPost: m("jsAtPost"), bytesAtPhoto: m("bytesAtPhoto"), runs });
  }
  await browser.close();

  const md = [
    `| 回線 | 最初の描画 | 枠が出るまで | 最初の投稿が見えるまで | 最初の写真が見えるまで | 通信量（投稿まで） | うち JS | 通信量（写真まで） |`,
    `|---|---|---|---|---|---|---|---|`,
    ...rows.map((r) => `| ${r.profile} | ${sec(r.fcp)}s | ${sec(r.shell)}s | ${sec(r.post)}s | ${sec(r.photo)}s | ${mb(r.bytesAtPost)}MB | ${kb(r.jsAtPost)}KB | ${mb(r.bytesAtPhoto)}MB |`),
  ].join("\n");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, `${LABEL}.json`), JSON.stringify({ runsPerProfile: RUNS, samples, rows }, null, 2));
  writeFileSync(resolve(OUT, `${LABEL}.md`), `${md}\n`);
  console.log(`\n${md}\n\n（${RUNS} 回の中央値。開発サーバー・キャッシュなし・ログイン済み）\n結果: ${resolve(OUT, `${LABEL}.md`)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    stopNext();
    setTimeout(() => process.exit(), 1000);
  });
