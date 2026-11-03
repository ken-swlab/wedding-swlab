#!/usr/bin/env node
/**
 * screens.mjs から呼ばれる（エミュレーターが立ち上がった中で動く）。next dev を起動し、場面ごとにスクショを撮る（Issue #230）。
 * 場面の一覧は src/config/preview-screens.json（見本ページ /dev/preview と共通）。各場面は /dev/preview?screen=<key> から開く。
 *
 * 撮るもの: 画面の大きさごとに、1画面目（<key>.png）とページ全体（<key>-full.png）。
 * 調べるもの（report.json）: 横スクロールが出ていないか、44px に満たない押せる部品（見えているもの）。
 * ★自動では分からないもの★ LINE・Safari・Chrome の実際のバーとの重なり（バーで縮んだ高さは、画面の大きさで近似するだけ）。
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(WEB, "screenshots");
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

/** 画面の大きさ（CSS px）。ブラウザのバーで縮んだ高さを含める（Issue #230） */
const VIEWPORTS = [
  { name: "mini", width: 375, height: 812, note: "iPhone 13 mini（全体）" },
  { name: "mini-bar", width: 375, height: 630, note: "iPhone 13 mini（Safari のバーあり相当）" },
  { name: "se", width: 375, height: 667, note: "iPhone SE 第3世代" },
  { name: "se-bar", width: 375, height: 550, note: "iPhone SE 第3世代（バーあり相当）" },
  { name: "android", width: 360, height: 740, note: "小さい Android" },
  { name: "narrow", width: 320, height: 568, note: "一番狭い場合" },
];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "").split(",").filter(Boolean) : null;
}
const only = arg("only");
// --debug: ページの移り変わりを表示する（意図しない転送を調べるとき）
const debug = process.argv.includes("--debug");
const onlyViewports = arg("viewports");

const { screens: ALL } = JSON.parse(readFileSync(resolve(WEB, "src/config/preview-screens.json"), "utf8"));
const screens = only ? ALL.filter((s) => only.includes(s.key)) : ALL;
const viewports = onlyViewports ? VIEWPORTS.filter((v) => onlyViewports.includes(v.name)) : VIEWPORTS;

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.error("Playwright が見つかりません。npx playwright install chromium などで入れてください（npm の依存には足していません）");
  process.exit(1);
}

// ---- next dev ----
// ★プロセスのまとまり（detached）で起動し、終わるときはまとまりごと止める★ next dev は子プロセスを作るので、
//   親だけ止めると残ってポートをふさぎ、次の撮影や dev:emulator が動かなくなる
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
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/dev/preview`);
      if (r.ok) return;
    } catch {
      /* まだ起動していない */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("next dev が起動しませんでした");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ゲストの画面に無いもの（Next の開発用の表示・試し見のページの「テスト」）を隠す。CSP は style-src 'unsafe-inline' で許可済み */
async function hideDevChrome(page) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}[data-preview-hide]{display:none!important}" });
}

/** 承認後の初回の演出が出ていたら閉じる（タイムラインなどを撮るとき） */
async function dismissWelcome(page) {
  const skip = page.locator('[aria-label="新郎新婦からの写真"] button', { hasText: "スキップ" });
  if (await skip.count()) {
    await skip.first().click();
    await sleep(800);
  }
}

/** 撮る前の操作（preview-screens.json の action） */
async function act(page, action) {
  switch (action) {
    case "toStart":
    case "toStartGuide": {
      await page.getByText("長押しで構える").first().waitFor({ state: "visible", timeout: 60_000 });
      await sleep(500);
      if (action === "toStartGuide") {
        const vp = page.viewportSize();
        await page.mouse.move(vp.width / 2, vp.height * 0.8);
        await page.mouse.down();
        return async () => page.mouse.up();
      }
      return null;
    }
    case "openRsvp":
      await page.getByRole("button", { name: /エントリーする/ }).last().click();
      return null;
    case "openComposer":
      await dismissWelcome(page);
      await page.locator('button[aria-label="新しく投稿する"]').click();
      return null;
    case "openFirstPhotoPost": {
      await dismissWelcome(page);
      const id = await page.evaluate(() => {
        const card = [...document.querySelectorAll("[data-post-card]")].find((a) => a.querySelector("img"));
        return card?.getAttribute("data-post-card") ?? null;
      });
      if (id) {
        await page.goto(`${BASE}/guestbook/posts/${id}`);
        await hideDevChrome(page);
      }
      return null;
    }
    case "keepWelcome":
      // 写真が届く演出そのものを撮る（閉じない）
      return null;
    default:
      await dismissWelcome(page);
      return null;
  }
}

/** 自動で分かる崩れ: 横スクロール、44px に満たない押せる部品（見えているもの） */
async function inspect(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const overflowX = document.documentElement.scrollWidth - vw;
    const small = [];
    for (const el of document.querySelectorAll("button, a[href], input, select, textarea, [role=button]")) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || st.visibility === "hidden" || st.pointerEvents === "none" || Number(st.opacity) === 0) continue;
      if (el.closest("[inert], [aria-hidden=true]")) continue;
      if (r.bottom < 0 || r.top > window.innerHeight * 3) continue;
      if (r.width < 44 || r.height < 44) {
        const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 30);
        small.push(`${label}（${Math.round(r.width)}×${Math.round(r.height)}）`);
      }
    }
    return { overflowX: overflowX > 0 ? overflowX : 0, smallTargets: [...new Set(small)] };
  });
}

async function main() {
  await waitUp();
  const browser = await chromium.launch();
  const report = {};
  for (const vp of viewports) {
    mkdirSync(resolve(OUT, vp.name), { recursive: true });
    for (const s of screens) {
      // 場面ごとに新しいコンテキスト（ログインの状態・演出の状態を持ち越さない）
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ja-JP" });
      const page = await ctx.newPage();
      if (debug) page.on("framenavigated", (f) => f === page.mainFrame() && console.log(`  → ${new URL(f.url()).pathname}${new URL(f.url()).search}`));
      // ★1つの場面に 90 秒まで★ 止まった場面があっても、ほかの場面は撮り続ける
      const guard = setTimeout(() => void ctx.close().catch(() => {}), 90_000);
      try {
        // 見本ページでテスト用アカウントに入る（入ったら見本ページから移る）
        await page.goto(`${BASE}/dev/preview?screen=${s.key}`);
        await page.waitForURL((u) => u.pathname !== "/dev/preview", { timeout: 60_000 });
        await sleep(1500);
        // ★入ったあと、目的の画面を開き直す★ ログインした直後のページ内の移動では、ゲストの画面の枠が
        //   まだ未ログインと判断して /invitation → /guestbook へ送ってしまう（保存済みのログインで開き直せば起きない）
        await page.goto(`${BASE}${s.path}`);
        await hideDevChrome(page);
        await sleep(1500);
        const release = await act(page, s.action);
        await sleep(s.settleMs ?? 1500);
        await page.screenshot({ path: resolve(OUT, vp.name, `${s.key}.png`) });
        report[`${vp.name}/${s.key}`] = await inspect(page);
        await page.screenshot({ path: resolve(OUT, vp.name, `${s.key}-full.png`), fullPage: true });
        if (release) await release();
        console.log(`✓ ${vp.name} ${s.key}`);
      } catch (e) {
        report[`${vp.name}/${s.key}`] = { error: String(e).slice(0, 200) };
        console.log(`✗ ${vp.name} ${s.key}: ${String(e).split("\n")[0]}`);
      }
      clearTimeout(guard);
      await ctx.close().catch(() => {});
    }
  }
  await browser.close();
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify({ viewports: VIEWPORTS, report }, null, 2));
  console.log(`\nスクショ: ${OUT}\n調べた結果: ${resolve(OUT, "report.json")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    stopNext();
    // エミュレーター（emulators:exec）はこのプロセスが終わるのを待っているので、確実に抜ける
    setTimeout(() => process.exit(), 1000);
  });
