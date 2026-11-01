#!/usr/bin/env node
/**
 * いいね（posts/{postId}/reactions/{uid}）に uid の項目があるかを確かめ、無ければ足す（Issue #212）。
 *
 * 自分のいいねの一覧は collectionGroup("reactions") を uid で絞って読む（MyReactionsContext）。
 * uid の無いいいねは一覧から漏れ、タイムラインで白いハートになる。書き込み（lib/posts.ts）は作成時から uid を
 * 書いているので、ふつうは 0 件のはず。
 *
 *   node scripts/backfill-reaction-uid.mjs           … 数えるだけ（書き込まない。既定）
 *   node scripts/backfill-reaction-uid.mjs --apply   … uid の無いいいねに、ドキュメント ID（＝いいねした人の uid）を足す
 *
 * ★--apply は本番を変える。オーナーの指示があるときだけ実行する★
 * ★足すのは uid だけ★ emoji・createdAt と、投稿の reactionCount は変えない（数は変わらない）。
 * ★uid がドキュメント ID と違ういいねは直さず、数だけ出す★（Rules で作れないはずのもの。見つかったら調べる）
 * app/web で実行する（.env.local のサービスアカウント、無ければ ADC）。
 */
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

const apply = process.argv.includes("--apply");
const PAGE = 300;

let posts = 0;
let reactions = 0;
let missing = 0;
let mismatched = 0;
let fixed = 0;
let cursor = null;

console.log(apply ? "\n✍️  uid の無いいいねに uid を足します\n" : "\n🔍 数えるだけです（書き込みません。足すときは --apply）\n");

for (;;) {
  let q = db.collection("posts").orderBy("__name__").limit(PAGE);
  if (cursor) q = q.startAfter(cursor);
  const snap = await q.get();
  if (snap.empty) break;

  for (const post of snap.docs) {
    posts += 1;
    const rs = await post.ref.collection("reactions").get();
    const batch = db.batch();
    let writes = 0;
    for (const r of rs.docs) {
      reactions += 1;
      const uid = r.get("uid");
      if (uid === undefined) {
        missing += 1;
        if (apply) {
          batch.update(r.ref, { uid: r.id });
          writes += 1;
        }
      } else if (uid !== r.id) {
        mismatched += 1;
      }
    }
    if (writes > 0) {
      await batch.commit();
      fixed += writes;
    }
  }

  cursor = snap.docs[snap.docs.length - 1];
  process.stdout.write(`\r  投稿 ${posts} 件…`);
  if (snap.size < PAGE) break;
}

console.log("\n");
console.log("────────────────────────────");
console.log(`  見た投稿                 : ${posts}`);
console.log(`  見たいいね               : ${reactions}`);
console.log(`  uid が無いいいね         : ${missing}`);
console.log(`  uid を足した             : ${fixed}`);
console.log(`  uid がドキュメント ID と違う: ${mismatched}（直していません）`);
console.log("────────────────────────────");
if (!apply && missing > 0) console.log("\n  uid を足すには --apply を付けて実行してください。\n");
