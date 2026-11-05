"use client";

import { deleteDoc, doc, getDocFromServer, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { deleteJson, postJson } from "@/lib/api-client";
import { keyUrl } from "@/lib/media-url";
import { VENUE_TEST, fixtureKeys } from "@/config/venue-test";
import { jitter, mbps, median, type VenueMetrics } from "@/lib/venue-test";

/**
 * 会場の電波テストの測定（Issue #256。管理者だけ）。本番と同じ置き場所への速さを、4つ順に測る（全体で 30〜40 秒）。
 *   1. 反応の速さ: /api/health に 20 回（アプリの API の往復）
 *   2. 写真を見る速さ: R2 の公開バケットの test/venue/fixtures/ の写真（feed 相当 100KB ×10 を同時に・1.5MB ×3 を同時に）
 *   3. 写真を送る速さ: 公開バケットの test/venue/up/ に 1MB を3回（今の投稿と同じ「予約 → 直接送る」）。測り終わったらすぐ消す
 *   4. データの読み書き: Firestore の venueProbe/{自分の uid} に書いて、サーバーから読み直す（3回。最後に消す）
 * ★どこかが測れなくても止めない★ 測れなかった値は null にして、理由を errors に入れる（会場で途中から測り直さずに済む）。
 */

export type MeasureStep = "ping" | "download" | "upload" | "firestore";
export const STEP_LABEL: Record<MeasureStep, string> = {
  ping: "反応の速さ",
  download: "写真を見る速さ",
  upload: "写真を送る速さ",
  firestore: "データの読み書き",
};

export type MeasureProgress = { step: MeasureStep; ratio: number };
export type MeasureResult = { metrics: VenueMetrics; errors: string[] };

function timeout<T>(p: Promise<T>, ms: number = VENUE_TEST.requestTimeoutMs): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("時間切れ")), ms))]);
}

/** 写真を1枚読む（<img> で。R2 は別のドメインなので fetch だと CORS が要る）。★毎回ちがう URL★（端末のキャッシュに当てない） */
function loadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("写真を読めませんでした"));
    img.src = `${url}${url.includes("?") ? "&" : "?"}vt=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });
}

/** 中身が乱数の 1MB（圧縮で小さくならない。写真としては表示しない） */
function dummyBlob(bytes: number, type: string): Blob {
  const buf = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i += 65536) crypto.getRandomValues(buf.subarray(i, Math.min(bytes, i + 65536)));
  return new Blob([buf], { type });
}

export async function measureVenue(onProgress: (p: MeasureProgress) => void): Promise<MeasureResult> {
  const errors: string[] = [];
  const m: VenueMetrics = {
    pingMedianMs: null, pingJitterMs: null, pingFailed: 0,
    feedScreenSec: null, downMbps: null, upMbps: null, uploadSecPerPhoto: null, firestoreMs: null,
  };

  // ---- 1. 反応の速さ ----
  const pings: number[] = [];
  for (let i = 0; i < VENUE_TEST.pingCount; i++) {
    onProgress({ step: "ping", ratio: i / VENUE_TEST.pingCount });
    const t0 = performance.now();
    try {
      const res = await timeout(fetch(`/api/health?vt=${Date.now()}`, { cache: "no-store" }), 5000);
      if (!res.ok) throw new Error(String(res.status));
      pings.push(performance.now() - t0);
    } catch {
      m.pingFailed += 1;
    }
  }
  m.pingMedianMs = median(pings);
  m.pingJitterMs = jitter(pings);
  if (m.pingFailed > 0) errors.push(`反応の速さ: ${VENUE_TEST.pingCount} 回のうち ${m.pingFailed} 回失敗しました`);

  // ---- 2. 写真を見る速さ ----
  const keys = fixtureKeys();
  const feedUrls = keys.feed.map((k) => keyUrl(k));
  const bigUrls = keys.big.map((k) => keyUrl(k));
  if (feedUrls.some((u) => !u) || bigUrls.some((u) => !u)) {
    errors.push("写真を見る速さ: 写真の配信元（NEXT_PUBLIC_MEDIA_BASE）が未設定のため測れません");
  } else {
    try {
      onProgress({ step: "download", ratio: 0 });
      // タイムラインの1画面ぶん: feed 相当を同時に
      let t0 = performance.now();
      await timeout(Promise.all(feedUrls.map((u) => loadImage(u!))));
      m.feedScreenSec = (performance.now() - t0) / 1000;
      onProgress({ step: "download", ratio: 0.4 });
      // 下りの速さ: 大きい写真を同時に
      t0 = performance.now();
      await timeout(Promise.all(bigUrls.map((u) => loadImage(u!))));
      m.downMbps = mbps(VENUE_TEST.download.bigBytes * bigUrls.length, performance.now() - t0);
    } catch (e) {
      errors.push(`写真を見る速さ: ${e instanceof Error ? e.message : "測れませんでした"}（テスト用の写真が置かれているか確かめてください）`);
    }
  }

  // ---- 3. 写真を送る速さ ----
  let uploaded: string[] = [];
  try {
    onProgress({ step: "upload", ratio: 0 });
    const r = await postJson<{ contentType: string; bytes: number; slots: { key: string; url: string }[] }>("/api/admin/venue-test/upload", {});
    uploaded = r.slots.map((s) => s.key);
    const times: number[] = [];
    for (const [i, slot] of r.slots.entries()) {
      const blob = dummyBlob(r.bytes, r.contentType);
      const t0 = performance.now();
      const res = await timeout(fetch(slot.url, { method: "PUT", headers: { "Content-Type": r.contentType }, body: blob }));
      if (!res.ok) throw new Error(`送れませんでした（${res.status}）`);
      times.push(performance.now() - t0);
      onProgress({ step: "upload", ratio: (i + 1) / r.slots.length });
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    m.uploadSecPerPhoto = avg / 1000;
    m.upMbps = mbps(r.bytes, avg);
  } catch (e) {
    errors.push(`写真を送る速さ: ${e instanceof Error ? e.message : "測れませんでした"}`);
  } finally {
    // ★送ったダミーはすぐ消す★（消し忘れても、置き場所のライフサイクルで1日で消える）
    if (uploaded.length > 0) await deleteJson("/api/admin/venue-test/upload", { keys: uploaded }).catch(() => errors.push("写真を送る速さ: ダミー画像を消せませんでした（1日で自動で消えます）"));
  }

  // ---- 4. データの読み書き ----
  const uid = auth.currentUser?.uid;
  if (!uid) {
    errors.push("データの読み書き: ログインし直してください");
  } else {
    const ref = doc(db, "venueProbe", uid);
    try {
      const times: number[] = [];
      for (let i = 0; i < VENUE_TEST.firestoreCount; i++) {
        onProgress({ step: "firestore", ratio: i / VENUE_TEST.firestoreCount });
        const t0 = performance.now();
        // 書けた（サーバーが受け取った）ところで setDoc が返る。続けてサーバーから読み直す
        await timeout(setDoc(ref, { n: i, at: serverTimestamp() }));
        await timeout(getDocFromServer(ref));
        times.push(performance.now() - t0);
      }
      m.firestoreMs = median(times);
    } catch (e) {
      errors.push(`データの読み書き: ${e instanceof Error ? e.message : "測れませんでした"}`);
    } finally {
      await deleteDoc(ref).catch(() => {});
    }
  }

  onProgress({ step: "firestore", ratio: 1 });
  return { metrics: m, errors };
}
