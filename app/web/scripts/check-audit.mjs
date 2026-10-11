#!/usr/bin/env node
/**
 * 依存の脆弱性検査（Issue #101）。npm audit の結果を、例外の一覧と照らして判定する。
 *
 *   node app/web/scripts/check-audit.mjs app/web
 *   node app/web/scripts/check-audit.mjs infra/workers/exif-stripper
 *
 * CI（.github/workflows/security.yml の npm-audit）が、npm ci --ignore-scripts のあとに実行する。
 *
 * 判定:
 *   - 本番に入る依存（npm audit --omit=dev）の high 以上 → 失敗
 *   - 開発用の依存だけにある指摘 → 失敗にせず、ジョブのサマリーに出す
 *   - 例外（.github/audit-ignore.json）に、理由が無い・期限が無い・期限切れ・期限が 90 日より先の項目がある → 失敗
 *
 * ★直すときに npm audit fix --force を使わない★
 *   メジャー更新まで入り、firebase-admin 14 で API がすべて 500 になった（Issue #38・dependabot.yml の注意）。
 *   Dependabot の PR か、対象のパッケージだけを手で上げ、deps-runtime のチェックが通ることを確かめる。
 * ★例外は「直せない・影響しない」と判断したものだけ★
 *   理由と期限を必ず書く。期限が来たら失敗に戻るので、そのときに判断し直す。
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const IGNORE_FILE = resolve(ROOT, ".github", "audit-ignore.json");
const MAX_IGNORE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const FAIL_SEVERITIES = new Set(["high", "critical"]);

const target = process.argv[2];
if (!target) {
  console.error("使い方: node app/web/scripts/check-audit.mjs <package.json のあるディレクトリ>");
  process.exit(2);
}
const targetDir = resolve(ROOT, target);

const summary = [];
function say(line = "") {
  console.log(line);
  summary.push(line);
}
function finish(code) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join("\n") + "\n\n");
  process.exit(code);
}

/** 例外の一覧を読み、形と期限を確かめる。問題があれば、その説明の配列を返す */
function loadIgnores() {
  const problems = [];
  const ids = new Map();
  let entries;
  try {
    entries = JSON.parse(readFileSync(IGNORE_FILE, "utf8")).ignore;
  } catch {
    return { ids, problems: [".github/audit-ignore.json を JSON として読めません"] };
  }
  if (!Array.isArray(entries)) return { ids, problems: ["audit-ignore.json の ignore が配列ではありません"] };

  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  for (const [i, entry] of entries.entries()) {
    const label = typeof entry?.id === "string" && entry.id ? entry.id : `${i + 1} 番目の項目`;
    if (typeof entry?.id !== "string" || !/^GHSA(-[0-9a-z]{4}){3}$/.test(entry.id)) {
      problems.push(`${label}: id はアドバイザリー ID（GHSA-xxxx-xxxx-xxxx）で書いてください`);
      continue;
    }
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      problems.push(`${label}: 理由（reason）がありません`);
    }
    const expires = typeof entry.expires === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.expires) ? Date.parse(entry.expires) : NaN;
    if (Number.isNaN(expires)) {
      problems.push(`${label}: 期限（expires）を YYYY-MM-DD で書いてください`);
    } else if (expires < today) {
      problems.push(`${label}: 期限切れです（${entry.expires}）。直すか、判断し直して期限を延ばしてください`);
    } else if (expires > today + MAX_IGNORE_DAYS * DAY_MS) {
      problems.push(`${label}: 期限が ${MAX_IGNORE_DAYS} 日より先です（${entry.expires}）`);
    }
    if (ids.has(entry.id)) problems.push(`${label}: 同じ ID が2回書かれています`);
    ids.set(entry.id, entry);
  }
  return { ids, problems };
}

/** npm audit を実行し、アドバイザリーごとにまとめる（同じアドバイザリーが複数のパッケージ経由で出るため） */
function audit(extraArgs) {
  const res = spawnSync("npm", ["audit", "--json", ...extraArgs], {
    cwd: targetDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    report = null;
  }
  // ★結果を読めなかったときは「問題なし」にしない★（レジストリへの接続失敗などを通過させない）
  if (!report || report.error || typeof report.vulnerabilities !== "object") {
    console.error(`npm audit の結果を読めませんでした（終了コード ${res.status}）`);
    return null;
  }
  const advisories = new Map();
  for (const vuln of Object.values(report.vulnerabilities)) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== "object" || !via.url) continue; // 文字列は「別のパッケージ経由」の印。元の指摘は別の項目にある
      const id = via.url.split("/").pop();
      if (!advisories.has(id)) {
        advisories.set(id, { id, severity: via.severity, name: via.name, title: via.title, url: via.url });
      }
    }
  }
  return advisories;
}

const row = (a, note = "") => `| ${a.severity} | \`${a.name}\` | [${a.id}](${a.url}) | ${String(a.title).replaceAll("|", "\\|")}${note} |`;
const HEAD = ["| 深刻度 | パッケージ | アドバイザリー | 内容 |", "|---|---|---|---|"];

say(`### npm audit: \`${target}\``);
say();

const { ids: ignores, problems } = loadIgnores();
const prod = audit(["--omit=dev", "--audit-level=high"]);
const all = audit([]);
if (!prod || !all) {
  say("npm audit を実行できませんでした。");
  finish(1);
}

const blocking = [];
const ignored = [];
const belowThreshold = [];
for (const a of prod.values()) {
  if (!FAIL_SEVERITIES.has(a.severity)) belowThreshold.push(a);
  else if (ignores.has(a.id)) ignored.push(a);
  else blocking.push(a);
}
const devOnly = [...all.values()].filter((a) => !prod.has(a.id));

if (blocking.length > 0) {
  say(`**本番に入る依存に high 以上の脆弱性が ${blocking.length} 件あります（失敗）**`);
  say();
  [...HEAD, ...blocking.map((a) => row(a))].forEach(say);
  say();
  say("Dependabot の PR をマージするか、対象のパッケージだけを上げてください（`npm audit fix --force` は使わない）。");
} else {
  say("本番に入る依存に、high 以上の脆弱性はありません。");
}
say();

if (ignored.length > 0) {
  say(`例外にしている指摘（${ignored.length} 件）:`);
  say();
  [...HEAD, ...ignored.map((a) => row(a, `（期限 ${ignores.get(a.id).expires}）`))].forEach(say);
  say();
}
if (belowThreshold.length > 0) {
  say(`本番に入る依存の moderate 以下（${belowThreshold.length} 件。失敗にしない）:`);
  say();
  [...HEAD, ...belowThreshold.map((a) => row(a))].forEach(say);
  say();
}
if (devOnly.length > 0) {
  say(`開発用の依存だけにある指摘（${devOnly.length} 件。失敗にしない）:`);
  say();
  [...HEAD, ...devOnly.map((a) => row(a))].forEach(say);
  say();
}
if (problems.length > 0) {
  say(`**例外の一覧（.github/audit-ignore.json）に問題があります（失敗）**`);
  say();
  problems.forEach((p) => say(`- ${p}`));
  say();
}

finish(blocking.length > 0 || problems.length > 0 ? 1 : 0);
