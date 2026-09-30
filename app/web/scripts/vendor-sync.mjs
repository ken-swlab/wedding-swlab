#!/usr/bin/env node
/**
 * ブラウザで読み込む第三者ライブラリを node_modules から public/vendor へ複製する。
 *
 *   node scripts/vendor-sync.mjs
 *
 * ★なぜ必要か★
 *   browser-image-compression は Web Worker の中で自分自身を importScripts する。
 *   既定の読み込み先は cdn.jsdelivr.net で、写真（EXIF の位置情報を含む）を扱う
 *   ワーカーで第三者 CDN のコードが動き、ゲストの IP も CDN に渡る。
 *   同じ版を自前で配信し、lib/image.ts の libURL でそちらを指す。
 *
 *   パッケージを更新したら、このスクリプトを再実行してコミットすること。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(WEB, "package.json"));

const LIBS = [
  {
    pkg: "browser-image-compression",
    file: "dist/browser-image-compression.js",
    out: "public/vendor/browser-image-compression.js",
    mustContain: "imageCompression",
  },
];

/** package.json の exports に塞がれていても、main から親をたどって見つける */
function packageDir(name) {
  const direct = join(WEB, "node_modules", name);
  if (existsSync(join(direct, "package.json"))) return direct;
  let dir = dirname(require.resolve(name));
  while (dir !== dirname(dir)) {
    const pj = join(dir, "package.json");
    if (existsSync(pj) && JSON.parse(readFileSync(pj, "utf8")).name === name) return dir;
    dir = dirname(dir);
  }
  throw new Error(`${name} が node_modules に見つかりません（npm ci を実行してください）`);
}

let failed = 0;
for (const lib of LIBS) {
  try {
    const dir = packageDir(lib.pkg);
    const version = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
    const body = readFileSync(join(dir, lib.file), "utf8");
    if (!body.includes(lib.mustContain)) throw new Error(`${lib.file} の中身が想定と違います`);

    const banner = `/*! ${lib.pkg}@${version} — node_modules から scripts/vendor-sync.mjs で複製。直接編集しない */\n`;
    const dest = join(WEB, lib.out);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, banner + body);
    console.log(`OK  ${lib.pkg}@${version} → ${lib.out} (${Math.round((banner.length + body.length) / 1024)} KB)`);
  } catch (e) {
    failed++;
    console.error(`NG  ${lib.pkg}: ${e instanceof Error ? e.message : e}`);
  }
}
process.exit(failed ? 1 : 0);
