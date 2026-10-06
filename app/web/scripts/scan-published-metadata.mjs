#!/usr/bin/env node
/**
 * 公開バケットの写真に、メタデータ（位置情報が入りうるもの）が残っていないかを調べる（Issue #28）。
 *
 *   node scripts/scan-published-metadata.mjs            調査だけ（読み取りのみ。既定）
 *   node scripts/scan-published-metadata.mjs --apply    「要修正」の原本を上書きする（本番を変える。オーナーの指示があるときだけ）
 *   … --apply --include-thumbs                           軽量版（u/{uid}/t/）の「要修正」も上書きする（入力は公開側。上書き前に退避する）
 *
 * Node 22.18 以上で app/web から実行する（Worker の formats.ts を型を落としてそのまま読み込むため）。
 * 鍵は app/web/.env.local（R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY /
 * R2_BUCKET_PUBLIC / R2_BUCKET_PRIVATE / R2_PUBLIC_BASE）から読む。
 *
 * ★判定は Worker の sanitize() そのものを使う★（infra/workers/exif-stripper/src/formats.ts）
 *   公開中のオブジェクトを sanitize() にかけ、出力が入力とバイト単位で一致しなければ「要修正」。
 *   PR #27 より前の Worker は SOS からファイル末尾までを丸写ししていたので、EOI の後ろに連結された
 *   2 枚目の JPEG（iPhone の MPF のゲインマップ・深度画像。独自の Exif に GPS が入ることがある）などが残っている。
 * ★画像の中身・Exif の値（座標など）を出力しない★ 出すのは件数・キー・理由（マーカーやチャンクの種類）だけ。
 *   キーには uid（line:xxx）が入るので、キーの一覧は端末の一時フォルダのファイルにだけ書き、
 *   画面には件数と理由の内訳を出す（リポジトリは公開なので、PR にもキーを貼らない）。
 *
 * --apply のときにすること（「要修正」の原本 u/{uid}/o/ だけ）:
 *   1. 入力は非公開バケットの原本（同じキー）。無ければ公開側を入力にし、上書き前に
 *      非公開バケットの _public-backup/{key} へ退避する（位置情報入りなので公開側には置かない）。
 *   2. sanitize() が ok なら、公開側の同じキーへ上書きする。Content-Type と Cache-Control は元のものを引き継ぐ。
 *      ok 以外なら上書きしない（扱いはオーナーが決める）。
 *   3. 上書きした URL の一覧をファイルに書く（Cloudflare のキャッシュの Purge に使う）。
 * ★原本（非公開バケットの u/）と Worker のマーカー（_linked/ など）には触らない★（CLAUDE.md ルール 18）
 * ★軽量版（u/{uid}/t/）は既定では調べるだけ★（Issue #28 の範囲外）。--include-thumbs のときだけ上書きする。
 *   軽量版には非公開の原本が無いので、入力は公開側そのもので、上書きの前に必ず退避する。
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv(resolve(HERE, "..", ".env.local"));

const need = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_PUBLIC", "R2_BUCKET_PRIVATE", "R2_PUBLIC_BASE"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`環境変数が足りません: ${missing.join(", ")}（app/web/.env.local を確認してください）`);
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const INCLUDE_THUMBS = process.argv.includes("--include-thumbs");
const PUBLIC = process.env.R2_BUCKET_PUBLIC;
const PRIVATE = process.env.R2_BUCKET_PRIVATE;
const PUBLIC_BASE = process.env.R2_PUBLIC_BASE.replace(/\/+$/, "");
/** 退避先（非公開バケット）。Worker は u/ と自分のマーカーしか見ないので、ここは処理対象にならない */
const BACKUP_PREFIX = "_public-backup/";
/** PR #27（Worker の修正）が main にマージされた時刻。これより後に公開されて「要修正」なら、Worker が古いまま */
const WORKER_FIX_MERGED_AT = new Date("2026-10-04T12:35:10Z");

const { sanitize, detect, keepJpegSegment, PNG_KEEP, WEBP_KEEP } = await import(
  "../../../infra/workers/exif-stripper/src/formats.ts"
).catch((e) => {
  console.error("Worker の formats.ts を読み込めません。Node 22.18 以上で app/web から実行してください。", e.code ?? "");
  process.exit(1);
});

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/** u/{uid}/{t|o}/{uuid}.{ext}（webhook の KEY_RE と同じ形） */
const MEDIA_KEY_RE = /^u\/[^/]+\/(t|o)\/[0-9a-f-]{36}\.[a-z0-9]+$/i;

async function listAll(bucket, prefix) {
  const out = [];
  let token;
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    out.push(...(r.Contents ?? []));
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function getBytes(bucket, key) {
  try {
    const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = new Uint8Array(await r.Body.transformToByteArray());
    return { bytes, contentType: r.ContentType, cacheControl: r.CacheControl };
  } catch (e) {
    if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

function same(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

const fourcc = (b, at) => (at + 4 > b.length ? "" : String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]));
const ascii = (seg, at, n) => Array.from(seg.subarray(at, at + n)).map((c) => (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : "")).join("");

/**
 * 何が残っているかを分類する（値は読まない。マーカー・チャンクの種類と、識別子の先頭だけ）。
 * 判定そのものは sanitize() の出力との比較で行い、ここは理由を付けるためだけに使う。
 */
function reasons(b, format) {
  const r = new Set();
  if (format === "jpeg") {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let p = 2;
    let app1 = 0;
    while (p + 3 < b.length) {
      if (b[p] !== 0xff) break;
      const m = b[p + 1];
      if (m === 0xff) { p += 1; continue; }
      const marker = 0xff00 | m;
      if (marker === 0xffd9) {
        if (p + 2 < b.length) r.add("JPEG: EOI の後ろにデータ（連結された別の画像など）");
        break;
      }
      if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { p += 2; continue; }
      const len = dv.getUint16(p + 2);
      const end = p + 2 + len;
      if (len < 2 || end > b.length) break;
      const seg = b.subarray(p, end);
      if (marker === 0xffe1) {
        app1 += 1;
        const id = ascii(seg, 4, 4) === "Exif" ? "Exif" : ascii(seg, 4, 28).startsWith("http://ns.adobe.com/xap") ? "XMP" : "その他";
        // Worker が作り直す APP1 は Orientation だけの 36 バイト。それ以外は落とされる
        if (!(id === "Exif" && seg.length === 36)) r.add(`JPEG: APP1（${id}）`);
      } else if (marker === 0xfffe) {
        r.add("JPEG: COM（コメント）");
      } else if (marker >= 0xffe0 && marker <= 0xffef && !keepJpegSegment(marker, seg)) {
        const tag = marker === 0xffe2 && ascii(seg, 4, 3) === "MPF" ? "MPF" : ascii(seg, 4, 8).replace(/[^A-Za-z0-9 _-]/g, "") || "?";
        r.add(`JPEG: APP${m - 0xe0}（${tag}）`);
      }
      p = end;
      if (marker === 0xffda) {
        let q = p;
        while (q + 1 < b.length) {
          if (b[q] === 0xff && b[q + 1] !== 0x00 && !(b[q + 1] >= 0xd0 && b[q + 1] <= 0xd7)) break;
          q += 1;
        }
        p = q;
      }
    }
    if (app1 > 1) r.add("JPEG: APP1 が複数");
  } else if (format === "png") {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let p = 8;
    while (p + 12 <= b.length) {
      const len = dv.getUint32(p);
      const type = fourcc(b, p + 4);
      if (!PNG_KEEP.has(type)) r.add(`PNG: チャンク ${type.replace(/[^A-Za-z]/g, "?")}`);
      p += 12 + len;
      if (type === "IEND") {
        if (p < b.length) r.add("PNG: IEND の後ろにデータ");
        break;
      }
    }
  } else if (format === "webp") {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const riffEnd = 8 + dv.getUint32(4, true);
    let p = 12;
    while (p + 8 <= Math.min(riffEnd, b.length)) {
      const cc = fourcc(b, p);
      const size = dv.getUint32(p + 4, true);
      if (!WEBP_KEEP.has(cc)) r.add(`WebP: チャンク ${cc.replace(/[^A-Za-z0-9 ]/g, "?")}`);
      p += 8 + size + (size % 2);
    }
    if (riffEnd < b.length) r.add("WebP: RIFF の長さより後ろにデータ");
  }
  if (r.size === 0) r.add("その他の差分（並び・VP8X のフラグなど）");
  return [...r];
}

/**
 * 残っている Exif のどれかに GPS の IFD（タグ 0x8825）があるか。★有無だけを見て、座標は読まない★
 *   EOI の後ろに連結された 2 枚目の画像の Exif も含めて、"Exif\0\0" を全部たどる。
 */
function hasGps(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let i = b.indexOf(0x45); i !== -1 && i + 18 < b.length; i = b.indexOf(0x45, i + 1)) {
    if (ascii(b, i, 4) !== "Exif" || b[i + 4] !== 0 || b[i + 5] !== 0) continue;
    const tiff = i + 6;
    try {
      const le = dv.getUint16(tiff) === 0x4949;
      if (dv.getUint16(tiff + 2, le) !== 0x002a) continue;
      const ifd0 = tiff + dv.getUint32(tiff + 4, le);
      const count = dv.getUint16(ifd0, le);
      for (let k = 0; k < count; k += 1) {
        if (dv.getUint16(ifd0 + 2 + k * 12, le) === 0x8825) return true;
      }
    } catch {
      /* 壊れた Exif は数えない */
    }
  }
  return false;
}

/** 1 件を調べる。返すのは分類と理由だけ */
function inspect(key, bytes) {
  const format = detect(bytes);
  if (format === "unknown") return { kind: "skip", note: "画像以外（動画など）" };
  const result = sanitize(bytes);
  if (result.status !== "ok") return { kind: "notok", format, note: `${result.status}: ${result.reason}` };
  if (same(result.out, bytes)) return { kind: "clean", format };
  const rs = reasons(bytes, format);
  if (hasGps(bytes)) rs.push("GPS のタグ（GPSInfo）あり");
  if (hasGps(result.out)) rs.push("⚠ sanitize の後にも GPS のタグが残る");
  return { kind: "dirty", format, reasons: rs, before: bytes.length, after: result.out.length };
}

// ───────────────────────── 調査 ─────────────────────────

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const keyListPath = join(tmpdir(), `scan-published-metadata-${stamp}.tsv`);
writeFileSync(keyListPath, "kind\tdir\tkey\tlastModified\tdetail\n");

const objects = (await listAll(PUBLIC, "u/")).filter((o) => MEDIA_KEY_RE.test(o.Key));
console.log(`公開バケット: ${objects.length} 件（u/*/o/ と u/*/t/）を調べます${APPLY ? "（--apply: 要修正の原本を上書きします）" : "（読み取りのみ）"}\n`);

const summary = { o: { clean: 0, dirty: 0, notok: 0, skip: 0 }, t: { clean: 0, dirty: 0, notok: 0, skip: 0 } };
const reasonCount = { o: {}, t: {} };
const dirtyAfterFix = { o: 0, t: 0 };
const toFix = [];
let n = 0;

for (const o of objects) {
  n += 1;
  const dir = MEDIA_KEY_RE.exec(o.Key)[1];
  const got = await getBytes(PUBLIC, o.Key);
  if (!got) continue;
  const res = inspect(o.Key, got.bytes);
  summary[dir][res.kind] += 1;
  if (res.kind === "dirty") {
    for (const r of res.reasons) reasonCount[dir][r] = (reasonCount[dir][r] ?? 0) + 1;
    if (o.LastModified && o.LastModified > WORKER_FIX_MERGED_AT) dirtyAfterFix[dir] += 1;
    if (dir === "o" || INCLUDE_THUMBS) toFix.push({ key: o.Key, dir, contentType: got.contentType, cacheControl: got.cacheControl });
  }
  if (res.kind !== "clean") {
    const detail = res.kind === "dirty" ? `${res.reasons.join(" / ")}（${res.before} → ${res.after} バイト）` : res.note;
    appendFileSync(keyListPath, `${res.kind}\t${dir}\t${o.Key}\t${o.LastModified?.toISOString() ?? ""}\t${detail}\n`);
  }
  if (n % 50 === 0) console.log(`  …${n} / ${objects.length}`);
}

const label = { clean: "問題なし", dirty: "要修正", notok: "sanitize が ok 以外（要確認）", skip: "対象外（動画など）" };
for (const dir of ["o", "t"]) {
  console.log(`\n── ${dir === "o" ? "原本（u/*/o/）" : "軽量版・動画（u/*/t/）"} ──`);
  for (const k of Object.keys(label)) console.log(`  ${label[k].padEnd(14)} ${String(summary[dir][k]).padStart(5)} 件`);
  const rs = Object.entries(reasonCount[dir]).sort((a, b) => b[1] - a[1]);
  if (rs.length) {
    console.log("  要修正の理由（1 件に複数あり）:");
    for (const [r, c] of rs) console.log(`    ${String(c).padStart(5)}  ${r}`);
  }
  if (dirtyAfterFix[dir] > 0) {
    console.log(`  ⚠ ${WORKER_FIX_MERGED_AT.toISOString()} より後に公開されて要修正: ${dirtyAfterFix[dir]} 件（Worker が古いままの可能性）`);
  }
}
console.log(`\nキーの一覧（端末の中だけ。共有しないでください）: ${keyListPath}`);

if (!APPLY) {
  console.log("\n読み取りのみで終了しました。上書きするときは --apply を付けて実行してください。");
  process.exit(0);
}

// ───────────────────────── 上書き（--apply） ─────────────────────────

const logPath = join(tmpdir(), `scan-published-metadata-apply-${stamp}.log`);
const purgePath = join(tmpdir(), `scan-published-metadata-purge-${stamp}.txt`);
writeFileSync(logPath, "key\tresult\tsource\tbefore\tafter\n");
writeFileSync(purgePath, "");
console.log(`\n要修正の${INCLUDE_THUMBS ? "原本と軽量版" : "原本"} ${toFix.length} 件を上書きします。ログ: ${logPath}`);

const applied = { written: 0, skipped: 0, backedUp: 0 };
for (const item of toFix) {
  // 軽量版（t/）には非公開の原本が無い。同じキーを非公開バケットに探しに行かない
  const fromPrivate = item.dir === "o" ? await getBytes(PRIVATE, item.key) : null;
  let source = "private";
  let input = fromPrivate?.bytes;
  if (!input) {
    // 原本が無い（消えた・別の経路）ものは公開側を入力にする。上書きの前に非公開バケットへ退避する
    const pub = await getBytes(PUBLIC, item.key);
    if (!pub) {
      appendFileSync(logPath, `${item.key}\tmissing\t-\t-\t-\n`);
      applied.skipped += 1;
      continue;
    }
    input = pub.bytes;
    source = "public";
    await client.send(new PutObjectCommand({
      Bucket: PRIVATE,
      Key: BACKUP_PREFIX + item.key,
      Body: input,
      ContentType: pub.contentType ?? "application/octet-stream",
      Metadata: { reason: "issue-28-backup-before-overwrite" },
    }));
    applied.backedUp += 1;
  }

  const result = sanitize(input);
  if (result.status !== "ok") {
    appendFileSync(logPath, `${item.key}\tnot-ok:${result.status}\t${source}\t${input.length}\t-\n`);
    applied.skipped += 1;
    continue;
  }
  await client.send(new PutObjectCommand({
    Bucket: PUBLIC,
    Key: item.key,
    Body: result.out,
    ContentType: item.contentType ?? result.contentType,
    CacheControl: item.cacheControl ?? "public, max-age=31536000, immutable",
  }));
  const head = await client.send(new HeadObjectCommand({ Bucket: PUBLIC, Key: item.key }));
  const ok = head.ContentLength === result.out.length;
  appendFileSync(logPath, `${item.key}\t${ok ? "written" : "written-size-mismatch"}\t${source}\t${input.length}\t${result.out.length}\n`);
  appendFileSync(purgePath, `${PUBLIC_BASE}/${item.key}\n`);
  applied.written += 1;
}

console.log(`\n上書き: ${applied.written} 件 / 上書きしなかった: ${applied.skipped} 件 / 退避: ${applied.backedUp} 件`);
console.log(`Cloudflare で Purge する URL の一覧: ${purgePath}`);
console.log("Purge のあと、--apply なしでもう一度実行して「要修正」が 0 件になることを確かめてください。");
