"use client";

import { useEffect, useMemo, useState } from "react";
import { markOriginalUnavailable } from "@/lib/media";
import type { UploadApi } from "@/hooks/useUpload";

/** サーバー側で原本を待っているメディア1件 */
export type PendingOriginal = { postId: string; thumbPath: string };

/** 投稿直後の一瞬の食い違いを警告に出さないための待ち時間 */
const SETTLE_MS = 6000;

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function UploadStatusBar({
  upload,
  serverPending = [],
}: {
  upload: UploadApi;
  /** 自分の投稿のうち、原本が pending のメディア一覧 */
  serverPending?: PendingOriginal[];
}) {
  const { jobs, failed, current, remaining, remainingBytes, running, sentCount, error, hydrated } =
    upload;
  const [giving, setGiving] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  /**
   * ★件数の引き算ではなく thumbPath で突き合わせる★
   *   件数比較だと、手元にある枚数とサーバーの枚数がたまたま一致しない
   *   だけで誤検知する。どの写真が手元に無いのかを直接特定する。
   */
  const missing = useMemo(() => {
    const local = new Set(jobs.map((j) => j.thumbPath));
    return serverPending.filter((it) => !local.has(it.thumbPath));
  }, [jobs, serverPending]);

  const missingKey = useMemo(
    () => missing.map((m) => m.thumbPath).sort().join("|"),
    [missing],
  );

  // 同じ食い違いが SETTLE_MS 続いたときだけ本物とみなす
  const [settledKey, setSettledKey] = useState("");
  useEffect(() => {
    if (!missingKey) return;
    const t = setTimeout(() => setSettledKey(missingKey), SETTLE_MS);
    return () => {
      clearTimeout(t);
      // ★食い違いが変わったら（解消も含む）数え直す★
      //   残しておくと、一度消えた同じ食い違いが戻ったときに待たずに表示してしまう。
      setSettledKey("");
    };
  }, [missingKey]);

  const showMissing =
    hydrated && !running && !gaveUp && missingKey !== "" && settledKey === missingKey;

  async function giveUp() {
    if (giving) return;
    setGiving(true);
    try {
      for (const it of missing) {
        await markOriginalUnavailable(it.postId, it.thumbPath).catch(() => {});
      }
      setGaveUp(true);
    } finally {
      setGiving(false);
    }
  }

  if (!hydrated) return null;
  if (remaining === 0 && sentCount === 0 && !showMissing && !error) return null;

  return (
    <div className="space-y-2">
      {/* ---- 送信中（全画面のときもヘッダーの段にロゴとボタンが残るので、位置は詰めない） ---- */}
      {running && (
        <div
          className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 rounded-2xl border border-sky-200 bg-sky-50/95 p-3 shadow-sm backdrop-blur"
        >
          <div className="flex items-center justify-between text-xs font-medium text-sky-900">
            <span>
              送信中… 残り {remaining} 枚（{mb(remainingBytes)}）
            </span>
            <span className="tabular-nums">
              {Math.round((current?.progress ?? 0) * 100)}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-200">
            <div
              className="h-full rounded-full bg-sky-600 transition-[width] duration-300"
              style={{ width: `${Math.max(3, (current?.progress ?? 0) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-sky-700">
            ゲストブックを開いたままお待ちください。閉じても写真は端末に残るので、
            あとから続きを送れます。
          </p>
        </div>
      )}

      {/* ---- 待機中（メインのバナー）---- */}
      {!running && remaining > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-amber-900">
              <span className="tabular-nums">{remaining}</span> 枚が本アップロード待ちです
            </p>
            <span className="shrink-0 tabular-nums text-[11px] text-amber-700">
              {mb(remainingBytes)}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800">
            会場の電波が混み合うため、高画質版は自動では送っていません。
            <span className="font-medium">ご自宅などで Wi-Fi に繋いだタイミング</span>
            で、下のボタンから送信をお願いします 📶
          </p>

          {failed.length > 0 && (
            <details className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2">
              <summary className="cursor-pointer text-[11px] font-medium text-rose-800">
                うち {failed.length} 枚が失敗しています（詳細）
              </summary>
              {/* スマホではコンソールが見られないので、理由は必ず画面に出す */}
              <ul className="mt-1.5 space-y-1">
                {failed.map((j) => (
                  <li key={j.id} className="text-[10px] leading-tight text-rose-700">
                    <span className="font-medium">{j.fileName}</span>
                    <span className="block text-rose-600">{j.error ?? "原因不明"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <button
            type="button"
            onClick={failed.length > 0 ? upload.retryFailed : upload.start}
            className="mt-3 w-full touch-manipulation rounded-full bg-amber-700 py-3 text-sm font-medium text-white transition active:bg-amber-900"
          >
            本アップロードを開始
          </button>

          <p className="mt-1.5 text-center text-[10px] text-amber-700/80">
            写真はこの端末に保存されています。通信量にご注意ください。
          </p>
        </div>
      )}

      {/* ---- 完了 ---- */}
      {!running && remaining === 0 && sentCount > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center">
          <p className="text-sm font-medium text-emerald-800">
            ✓ {sentCount} 枚の高画質版を送信しました
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-700">
            ありがとうございます。ふたりの宝物になります 🌿
          </p>
        </div>
      )}

      {/* ---- この端末に実体が見つからない ---- */}
      {showMissing && (
        <div className="rounded-2xl border border-stone-300 bg-white p-3">
          <p className="text-xs font-medium text-stone-800">
            高画質版がこの端末に見つからない写真が {missing.length} 枚あります
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
            考えられる理由は2つです。
            <span className="mt-1 block">
              ① <span className="font-medium">別の画面から投稿した</span> — 高画質版は投稿したときの
              ブラウザにしか残りません。LINE のトークに届いたリンクから開き直すと送信できます。
            </span>
            <span className="mt-1 block">
              ② <span className="font-medium">端末から削除された</span> — 時間が経つと、
              ブラウザが自動的に消すことがあります。この場合は回収できません。
            </span>
          </p>
          <button
            type="button"
            onClick={() => void giveUp()}
            disabled={giving}
            className="mt-2.5 w-full touch-manipulation rounded-full border border-stone-300 py-2.5 text-xs text-stone-600 transition active:bg-stone-100 disabled:opacity-50"
          >
            {giving ? "処理中…" : "この端末にはありません（この案内を消す）"}
          </button>
        </div>
      )}

      {/* ---- エラー ---- */}
      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] leading-relaxed text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
