// R2 のマーカーを読み取り専用で集計する。削除は一切しない。
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";

const need = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`環境変数が足りません: ${missing.join(", ")}`);
  console.error("  set -a; source app/web/.env.local; set +a   などで読み込んでください");
  process.exit(1);
}

const BUCKET = process.env.R2_BUCKET_PRIVATE || "wedding-originals";
const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/** 1000件で切れないよう必ずページングする */
async function listAll(prefix) {
  const out = [];
  let token;
  do {
    const r = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: prefix, ContinuationToken: token,
    }));
    out.push(...(r.Contents ?? []));
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

const PREFIXES = ["_linked/", "_pending/", "_failed/", "_skipped/"];

console.log(`バケット: ${BUCKET}\n`);
const counts = {};
for (const p of PREFIXES) {
  const items = await listAll(p);
  counts[p] = items.length;
  console.log(`${p.padEnd(11)} ${String(items.length).padStart(5)} 件`);
}

const originals = (await listAll("u/")).filter((o) => /\/o\/[0-9a-f-]{36}\./i.test(o.Key));
console.log(`${"原本".padEnd(9)} ${String(originals.length).padStart(5)} 件`);
const done = counts["_linked/"] + counts["_skipped/"];
console.log(`\n未決着: ${originals.length - done} 件`);

// 隔離の理由を数える。customMetadata は HEAD で取る
const skipped = await listAll("_skipped/");
if (skipped.length === 0) {
  console.log("\n隔離はまだ1件もありません。");
} else {
  console.log(`\n── 隔離の内訳（${skipped.length}件）──`);
  const byReason = {};
  for (const s of skipped.slice(0, 200)) {
    const h = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: s.Key }));
    const r = h.Metadata?.reason ?? "unknown";
    const n = h.Metadata?.notified === "1";
    byReason[r] = byReason[r] ?? { total: 0, notified: 0 };
    byReason[r].total++;
    if (n) byReason[r].notified++;
  }
  for (const [r, v] of Object.entries(byReason).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${r.padEnd(20)} ${String(v.total).padStart(4)} 件（UI へ通知済み ${v.notified}）`);
  }
  console.log("\n最初の5件:");
  skipped.slice(0, 5).forEach((s) => console.log("  " + s.Key.slice("_skipped/".length)));
}
