#!/usr/bin/env node
/**
 * サーバー（API ルート）で使う依存を require() で読み込めるか確かめる。
 *
 *   npx -y -p node@20.18.0 node scripts/check-server-require.mjs
 *
 * CI（.github/workflows/deps-runtime.yml）が、依存を変える PR で古い Node を使って実行する。
 *
 * ★なぜ必要か（Issue #38 / #58 / #59）★
 *   firebase-admin 14 は firebase-admin/auth → jwks-rsa 4 → ESM 専用の jose 6 を require() する。
 *   Vercel の関数ではこれが ERR_REQUIRE_ESM で落ち、firebase-admin を使う API がすべて 500 になった。
 *   手元の Node 22 や Node 20 の最新版は ESM の require() に対応しているので、tsc・lint・next build は
 *   すべて通り、マージして本番に出るまで気づけない。対応していない古い Node で読み込んで先に見つける。
 *
 * ★ここに並べるもの★
 *   Next.js はサーバーの依存の一部をバンドルせず、実行時に require() する
 *   （node_modules/next/dist/lib/server-external-packages.jsonc。firebase-admin・@aws-sdk/client-s3・sharp など）。
 *   壊れるのはそこなので、まずそれを並べる。加えて、src/app/api と src/lib/*-server.ts が読む
 *   サーバー専用のパッケージも並べる（バンドルされるものは ESM でも動くが、念のため読めることを確かめる。
 *   バンドルされるパッケージだけがここで落ちたときは、本番で本当に落ちるかを見てから外す）。
 *   サーバーで新しいパッケージを使い始めたら、ここに足す。
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const MODULES = [
  // Next.js が実行時に require() するもの
  "firebase-admin/app",
  "firebase-admin/auth",
  "firebase-admin/firestore",
  "firebase-admin/storage",
  "@aws-sdk/client-s3",
  "sharp",
  // バンドルされるが、サーバーだけで使うもの
  "@aws-sdk/s3-request-presigner",
  "@aws-sdk/client-rekognition",
  "@google/genai",
  "@vercel/functions",
];

let failed = 0;
for (const name of MODULES) {
  try {
    require(name);
    console.log(`ok    ${name}`);
  } catch (e) {
    failed += 1;
    const code = e && typeof e === "object" && "code" in e ? e.code : "";
    console.error(`FAIL  ${name}  ${code}`);
    console.error(e);
  }
}

console.log(`\nNode ${process.version}: ${MODULES.length - failed} / ${MODULES.length} 件を読み込めました`);
if (failed > 0) {
  console.error(
    "\nサーバーの依存が require() で読み込めません。Vercel の関数で API が 500 になります（Issue #38）。",
  );
  process.exit(1);
}
