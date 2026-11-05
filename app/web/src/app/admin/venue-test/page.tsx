"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { postJson } from "@/lib/api-client";
import { useGuestSession } from "@/hooks/useGuestSession";
import { VENUE_TEST } from "@/config/venue-test";
import { VERDICT_LABEL, capacity, verdictOf, type VenueMetrics, type Verdict } from "@/lib/venue-test";
import { STEP_LABEL, measureVenue, type MeasureProgress } from "@/lib/venue-measure";
import { VenueTestDashboard } from "@/components/admin/VenueTestDashboard";

/** 前回選んだ場所・携帯会社（この端末だけ。使い勝手のためで、無くても動く） */
const LAST_KEY = "venueTest:last";
const STEPS = ["ping", "download", "upload", "firestore"] as const;

type Done = { metrics: VenueMetrics; errors: string[]; people: number | null; verdict: Verdict; saved: boolean; liveId: string | null };

const VERDICT_BOX: Record<Verdict, string> = {
  roomy: "border-stone-300 bg-stone-50 text-stone-800",
  caution: "border-amber-300 bg-amber-50 text-amber-900",
  tight: "border-rose-300 bg-rose-50 text-rose-900",
  unknown: "border-stone-200 bg-white text-stone-600",
};

const fmt = (v: number | null, digits = 1) => (v == null ? "—" : v.toFixed(digits));

/** 前回の選択（読めなければ空。プライベートブラウズなどでも動く） */
function readLast(): { place: string; customPlace: string; carrier: string } {
  const empty = { place: "", customPlace: "", carrier: "" };
  if (typeof window === "undefined") return empty;
  try {
    const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null") as { place?: string; carrier?: string } | null;
    const carrier = last?.carrier && (VENUE_TEST.carriers as readonly string[]).includes(last.carrier) ? last.carrier : "";
    if (!last?.place) return { ...empty, carrier };
    if ((VENUE_TEST.places as readonly string[]).includes(last.place)) return { place: last.place, customPlace: "", carrier };
    return { place: "__custom", customPlace: last.place, carrier };
  } catch {
    return empty;
  }
}

/**
 * 会場の電波テスト（Issue #256。管理者だけ）。宴会場の決まった場所で、本番と同じ置き場所（R2・アプリの API・Firestore）への
 * 速さを測り、「この速さを何人で分けても足りるか」の目安を出す。下半分は、これまでの測定のダッシュボード。
 *
 * ★判定には必ず注意書きを出す★ 1台で測った目安で、実際は同じ基地局を使う人数で変わる。同時測定で確かめる。
 * ★同時測定★ 「同時測定を始める」で、サーバーが今から 15 秒後の開始時刻を venueTestLive/current に書く。
 *   この画面を開いている管理者の端末が購読していて、その時刻に一斉に測る（場所・携帯会社は、各端末で今選んでいるもの）。
 *   端末の時計のずれは、サーバーが返した時刻との差で直す。
 * ★スマホで操作する★ 大きなボタン・1列。
 */
export default function VenueTestPage() {
  const { user, isAdmin, loading: authLoading } = useGuestSession();
  // 前回の選択から始める（この画面はログインの確認が済んでから描くので、サーバーの HTML とずれない）
  const [initial] = useState(readLast);
  const [place, setPlace] = useState(initial.place);
  const [customPlace, setCustomPlace] = useState(initial.customPlace);
  const [carrier, setCarrier] = useState(initial.carrier);
  const [memo, setMemo] = useState("");
  const [progress, setProgress] = useState<MeasureProgress | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<{ liveId: string; startAtMs: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const running = useRef(false);
  const ranLive = useRef(new Set<string>());
  // 端末の時計とサーバーの時計の差（同時測定の開始を合わせる）。「始める」を押した端末だけが分かるので、ほかは 0
  const [clockSkew, setClockSkew] = useState(0);

  const placeValue = place === "__custom" ? customPlace.trim() : place;
  const ready = !!placeValue && [...placeValue].length <= VENUE_TEST.placeMax && !!carrier;

  const run = useCallback(
    async (liveId: string | null) => {
      if (running.current) return;
      if (!placeValue || !carrier) {
        setError("場所と携帯会社を選んでから測ってください");
        return;
      }
      running.current = true;
      setError(null);
      setDone(null);
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ place: placeValue, carrier }));
      } catch {
        /* 覚えられなくても測る */
      }
      try {
        const { metrics, errors } = await measureVenue(setProgress);
        const people = capacity(metrics, VENUE_TEST);
        const verdict = verdictOf(people, VENUE_TEST);
        let saved = false;
        try {
          await postJson("/api/admin/venue-test/results", { place: placeValue, carrier, memo, liveId, metrics });
          saved = true;
        } catch (e) {
          errors.push(`保存できませんでした: ${e instanceof Error ? e.message : "不明なエラー"}`);
        }
        setDone({ metrics, errors, people, verdict, saved, liveId });
      } finally {
        setProgress(null);
        running.current = false;
      }
    },
    [placeValue, carrier, memo],
  );

  // 同時測定の開始時刻を購読する
  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(
      doc(db, "venueTestLive", "current"),
      (snap) => {
        const liveId = snap.get("liveId");
        const startAt = snap.get("startAt");
        if (typeof liveId !== "string" || !startAt || typeof startAt.toMillis !== "function") return;
        const startAtMs = startAt.toMillis();
        // 始まってから少し過ぎたもの・測り済みのものは無視する（開き直したときに古い回で測らない）
        if (ranLive.current.has(liveId) || startAtMs < Date.now() + clockSkew - 3000) return;
        setCountdown({ liveId, startAtMs });
      },
      (e) => console.error("[venue-test] 同時測定の開始時刻を読めませんでした", e),
    );
  }, [isAdmin, clockSkew]);

  // カウントダウンと、時刻になったら測る
  useEffect(() => {
    if (!countdown) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    const wait = Math.max(0, countdown.startAtMs - (Date.now() + clockSkew));
    const t = setTimeout(() => {
      ranLive.current.add(countdown.liveId);
      setCountdown(null);
      void run(countdown.liveId);
    }, wait);
    return () => {
      clearInterval(tick);
      clearTimeout(t);
    };
  }, [countdown, run, clockSkew]);

  async function startLive() {
    if (!ready) {
      setError("場所と携帯会社を選んでから始めてください");
      return;
    }
    try {
      const r = await postJson<{ liveId: string; startAtMs: number; serverNowMs: number }>("/api/admin/venue-test/live", {});
      setClockSkew(r.serverNowMs - Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "同時測定を始められませんでした");
    }
  }

  if (authLoading) return <main className="min-h-screen bg-stone-50 p-8"><div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" /></main>;
  if (!user || !isAdmin) return <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8"><div className="max-w-sm rounded-2xl border border-stone-200 bg-white p-8 text-center"><p className="font-medium text-stone-800">管理者専用ページです</p></div></main>;

  const busy = progress !== null;
  const stepIndex = progress ? STEPS.indexOf(progress.step) : 0;
  const overall = progress ? (stepIndex + progress.ratio) / STEPS.length : 0;
  const secondsLeft = countdown ? Math.max(0, Math.ceil((countdown.startAtMs - (now + clockSkew)) / 1000)) : 0;
  const chip = (on: boolean) =>
    `min-h-11 touch-manipulation rounded-full border px-4 text-sm transition ${on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"}`;

  return (
    <main className="selectable min-h-screen bg-stone-50" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-4 md:py-8">
        <header>
          <Link href="/admin" className="inline-flex min-h-11 touch-manipulation items-center text-xs text-stone-500 hover:text-stone-800">← ゲスト管理</Link>
          <h1 className="font-serif text-xl text-stone-900">会場の電波テスト</h1>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            宴会場の決まった場所で、本番と同じ置き場所（写真の保存先・アプリの API・データベース）への速さを測ります。約 30〜40 秒かかります。
          </p>
        </header>

        <section className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-stone-800">場所</legend>
            <div className="flex flex-wrap gap-2">
              {VENUE_TEST.places.map((p) => (
                <button key={p} type="button" aria-pressed={place === p} disabled={busy} onClick={() => setPlace(p)} className={chip(place === p)}>{p}</button>
              ))}
              <button type="button" aria-pressed={place === "__custom"} disabled={busy} onClick={() => setPlace("__custom")} className={chip(place === "__custom")}>そのほか</button>
            </div>
            {place === "__custom" && (
              <input
                value={customPlace}
                onChange={(e) => setCustomPlace(e.target.value)}
                maxLength={VENUE_TEST.placeMax}
                placeholder="例：高砂の前"
                aria-label="場所（自由入力）"
                className="mt-2 min-h-11 w-full rounded-xl border border-stone-200 px-3 text-base"
              />
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-stone-800">携帯会社</legend>
            <div className="flex flex-wrap gap-2">
              {VENUE_TEST.carriers.map((c) => (
                <button key={c} type="button" aria-pressed={carrier === c} disabled={busy} onClick={() => setCarrier(c)} className={chip(carrier === c)}>{c}</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-stone-400">ブラウザからは分からないので、ご自身で選んでください。</p>
          </fieldset>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-stone-800">メモ（任意）</span>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={VENUE_TEST.memoMax}
              placeholder="例：人が多い時間"
              disabled={busy}
              className="min-h-11 w-full rounded-xl border border-stone-200 px-3 text-base"
            />
          </label>

          {countdown && (
            <p role="status" className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
              同時測定：あと <span className="font-semibold tabular-nums">{secondsLeft}</span> 秒で始まります（場所・携帯会社は今の選択で測ります）
            </p>
          )}

          {busy ? (
            <div role="status" aria-live="polite">
              <p className="text-sm text-stone-700">
                測っています：<span className="font-semibold">{STEP_LABEL[progress.step]}</span>（{stepIndex + 1}/{STEPS.length}）
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                {/* 進み具合は style で渡す（この部品はタップのあとでだけ描く） */}
                <div className="h-full origin-left rounded-full bg-stone-800 transition-transform duration-300" style={{ transform: `scaleX(${overall})` }} />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void run(null)}
              disabled={!ready || !!countdown}
              className="min-h-14 w-full touch-manipulation rounded-full bg-stone-900 text-lg font-semibold text-white hover:bg-stone-700 disabled:opacity-40"
            >
              スタート
            </button>
          )}
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        </section>

        {done && <ResultCard done={done} onStartLive={() => void startLive()} liveDisabled={busy || !!countdown} />}

        <VenueTestDashboard />
      </div>
    </main>
  );
}

function ResultCard({ done, onStartLive, liveDisabled }: { done: Done; onStartLive: () => void; liveDisabled: boolean }) {
  const m = done.metrics;
  const items: [string, string][] = [
    ["反応の速さ（中央値）", `${fmt(m.pingMedianMs, 0)} ms（ばらつき ${fmt(m.pingJitterMs, 0)} ms・失敗 ${m.pingFailed} 回）`],
    ["タイムライン1画面", `${fmt(m.feedScreenSec, 2)} 秒`],
    ["下り", `${fmt(m.downMbps)} Mbps`],
    ["上り", `${fmt(m.upMbps)} Mbps`],
    ["写真1枚の送信", `${fmt(m.uploadSecPerPhoto, 2)} 秒`],
    ["データの読み書き", `${fmt(m.firestoreMs, 0)} ms`],
  ];
  return (
    <section className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
      <h2 className="font-serif text-lg text-stone-900">結果{done.liveId ? "（同時測定）" : ""}</h2>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        {items.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-stone-100 pb-1">
            <dt className="text-stone-500">{k}</dt>
            <dd className="text-right tabular-nums text-stone-900">{v}</dd>
          </div>
        ))}
      </dl>

      <div className={`rounded-xl border px-4 py-3 ${VERDICT_BOX[done.verdict]}`}>
        <p className="text-base font-semibold">
          判定：{VERDICT_LABEL[done.verdict]}
        </p>
        <p className="mt-1 text-sm">
          {done.people != null
            ? `この場所の速さなら、約 ${done.people} 人が同時に使っても足りる目安です（${VENUE_TEST.expectedGuests} 人の想定に対して ${VERDICT_LABEL[done.verdict]}）。`
            : "下り・上りが測れなかったため、目安を出せませんでした。"}
        </p>
        <p className="mt-1 text-xs opacity-80">
          1人あたり：見る {VENUE_TEST.perPerson.viewMbps}Mbps × {VENUE_TEST.concurrency.view * 100}%・送る {VENUE_TEST.perPerson.sendMbps}Mbps × {VENUE_TEST.concurrency.send * 100}% として計算しています。
        </p>
      </div>
      {/* ★注意書きは必ず出す★（Issue #256） */}
      <p role="note" className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
        1台で測った目安です。実際には、同じ基地局を使う人数で速さが変わります。同時測定で確かめてください。
      </p>

      {done.errors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {done.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      {done.saved && <p className="text-xs text-emerald-700">保存しました（下の一覧に出ます）。</p>}

      <button
        type="button"
        onClick={onStartLive}
        disabled={liveDisabled}
        className="min-h-[var(--inv-tap)] w-full touch-manipulation rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-40"
      >
        同時測定を始める（15 秒後に、この画面を開いている端末で一斉に測ります）
      </button>
    </section>
  );
}
