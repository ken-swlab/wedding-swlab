"use client";

import { startInactiveSpan } from "@sentry/nextjs";
import { whenSentryReady } from "./sentry-ready";

/**
 * 起動の各段階の時刻を測り、Sentry に1回だけ送る（Issue #277）。
 *
 *   html           … HTML を受け取り終えた（ブラウザのナビゲーションの記録 responseEnd）
 *   js             … アプリの JS が動き始めた（instrumentation-client）
 *   liff-init      … LINE の SDK の準備（liff.init）が済んだ（ログインするときだけ）
 *   auth-line      … /api/auth/line が返った（ログインするときだけ）
 *   firebase-login … Firebase のログインが済んだ（端末に残ったログインの復元を含む）
 *   first-content  … 最初の中身（入口・パスコード・タイムラインなど。スプラッシュ以外）が出た
 *
 * ★値は、ページを開いてからのミリ秒だけ★ 中身・uid は送らない。抽出は今の 10%（tracesSampleRate）のまま。
 * ★送るのは first-content のあと1回だけ★ 同じページの中で画面を移っても、送り直さない。
 * Sentry では「app.boot」の記録に boot.<段階>_ms として付く。
 */
export type BootStage = "js" | "liff-init" | "auth-line" | "firebase-login" | "first-content";
const STAGES: BootStage[] = ["js", "liff-init", "auth-line", "firebase-login", "first-content"];

let reported = false;

export function bootMark(stage: BootStage) {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  if (performance.getEntriesByName(`boot:${stage}`, "mark").length > 0) return;
  performance.mark(`boot:${stage}`);
  if (stage === "first-content") void report();
}

/** 測った値（ページを開いてからのミリ秒）。perf:slow も読む */
export function bootTimings(): Record<string, number> {
  const out: Record<string, number> = {};
  const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav) out.html = Math.round(nav.responseEnd);
  for (const s of STAGES) {
    const e = performance.getEntriesByName(`boot:${s}`, "mark")[0];
    if (e) out[s] = Math.round(e.startTime);
  }
  return out;
}

async function report() {
  if (reported) return;
  reported = true;
  const values = bootTimings();
  const end = values["first-content"];
  if (end === undefined) return;
  await whenSentryReady();
  const attributes: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) attributes[`boot.${k.replace(/-/g, "_")}_ms`] = v;
  const origin = performance.timeOrigin;
  const span = startInactiveSpan({ name: "app.boot", op: "app.boot", forceTransaction: true, startTime: origin / 1000, attributes });
  span.end((origin + end) / 1000);
}
