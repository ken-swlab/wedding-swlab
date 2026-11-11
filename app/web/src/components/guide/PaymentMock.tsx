"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DUMMY_PAYMENT, PAYMENT_STATUSES, PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/config/payment";
import { useCachedJson } from "@/hooks/useCachedJson";
import { PAYMENT_CACHE_KIND } from "@/lib/community-client";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { ATTENDANCE_OPTIONS, type Attendance } from "@/types/admin";
import type { PaymentStatusResponse } from "@/types/payment";
import { PaymentBreakdown } from "./PaymentBreakdown";
import { CheckCircleIcon, HourglassIcon } from "@/components/icons";

type Method = "paypay" | "cotra" | "bank";

const METHODS: { key: Method; label: string }[] = [
  { key: "paypay", label: "PayPay" },
  { key: "cotra", label: "ことら送金" },
  { key: "bank", label: "銀行振込" },
];

/** 区切り（Issue #236。白いカードにせず、上下の罫線と余白で区切る） */
const card = "border-y border-stone-200 py-4";
const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

/** 表示確認で選べる出欠（管理者の自分の回答のまま＝null） */
type Preview = { attendance: Attendance; carFare: boolean } | null;

/**
 * 会費タブ（Issue #73 のモック → #148 で内訳だけ本物）。
 *   内訳と合計は GET /api/guest/payment から受け取る本物の計算（金額は config/payment）。
 *   送金先と送金状況はまだモック（useState だけで持ち、Firestore にも API にも繋がない）。
 *   ★前回の結果をすぐ出し、裏で読み直す★（useCachedJson。Issue #286）出欠・お車代を変えたら、変えた側がキャッシュを捨てる。
 *   ★管理者のプレビュー（?attendance=）はキャッシュしない★（本人の本当の内訳ではないため）
 *
 * ★管理者だけに出す★ 送金先はダミー（config/payment.ts）。ゲストが本物と思って送金しないよう、
 *   呼び出し側（/guide/payment）で isAdmin のときだけ描画する。送金先を本物にしたらゲストにも出す。
 */
export function PaymentMock() {
  const [status, setStatus] = useState<PaymentStatus>("unpaid");
  const [preview, setPreview] = useState<Preview>(null);
  const { user } = useGuestSessionContext();
  const q = preview ? `?attendance=${preview.attendance}&carFare=${preview.carFare ? 1 : 0}` : "";
  const { data, error } = useCachedJson<PaymentStatusResponse>(user?.uid, PAYMENT_CACHE_KIND, preview ? `preview${q}` : "self", `/api/guest/payment${q}`, {
    cache: preview === null,
  });

  return (
    <>
      <DebugStatusSwitch status={status} onChange={setStatus} />
      <DebugPreviewSwitch preview={preview} onChange={setPreview} />
      <h1 className="mb-4 font-serif text-xl tracking-wide text-stone-900">会費</h1>
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {status === "unpaid" && (data ? <UnpaidView data={data} onPaid={() => setStatus("pending")} /> : !error && <div className="h-40 animate-pulse rounded-2xl bg-stone-200/60" />)}
      {status === "pending" && (
        <StatusMessage icon={<HourglassIcon className="h-12 w-12" />} tone="amber">
          送金完了、新郎新婦確認待ち
        </StatusMessage>
      )}
      {status === "completed" && (
        <StatusMessage icon={<CheckCircleIcon className="h-12 w-12" />} tone="emerald">
          送金完了、受領完了。
          <br />
          ありがとうございます
        </StatusMessage>
      )}
    </>
  );
}

/** 表示確認用: 送金状況を強制的に切り替える。画面の右上に小さく置く */
function DebugStatusSwitch({ status, onChange }: { status: PaymentStatus; onChange: (s: PaymentStatus) => void }) {
  return (
    <div className="mb-3 flex items-center justify-end gap-1.5">
      <span className="text-[length:calc(10px*var(--inv-scale))] text-stone-400">表示確認（管理者のみ）</span>
      <div role="group" aria-label="送金状況の切り替え（表示確認用）" className="flex gap-1">
        {PAYMENT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => onChange(s)}
            className={`touch-manipulation rounded-full border px-2 py-1 text-[length:calc(10px*var(--inv-scale))] transition ${
              status === s ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-500 hover:bg-stone-100"
            }`}
          >
            {PAYMENT_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 表示確認用: 出欠とお車代を差し替えて内訳を見る（計算はサーバー。管理者だけが差し替えられる） */
function DebugPreviewSwitch({ preview, onChange }: { preview: Preview; onChange: (p: Preview) => void }) {
  const attendance = preview?.attendance ?? "";
  return (
    <div className="mb-3 flex flex-wrap items-center justify-end gap-1.5 text-[length:calc(10px*var(--inv-scale))] text-stone-500">
      <span className="text-stone-400">内訳の確認</span>
      <select
        aria-label="出欠（表示確認用）"
        value={attendance}
        onChange={(e) => onChange(e.target.value ? { attendance: e.target.value as Attendance, carFare: preview?.carFare ?? false } : null)}
        className="rounded-full border border-stone-200 bg-white px-2 py-1 text-[length:calc(10px*var(--inv-scale))]"
      >
        <option value="">自分の回答</option>
        {ATTENDANCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <label className={`flex items-center gap-1 ${preview ? "" : "opacity-40"}`}>
        <input
          type="checkbox"
          disabled={!preview}
          checked={preview?.carFare ?? false}
          onChange={(e) => preview && onChange({ ...preview, carFare: e.target.checked })}
        />
        お車代
      </label>
    </div>
  );
}

function UnpaidView({ data, onPaid }: { data: PaymentStatusResponse; onPaid: () => void }) {
  const [method, setMethod] = useState<Method>("paypay");
  const [confirmingPaypay, setConfirmingPaypay] = useState(false);
  const { bank } = DUMMY_PAYMENT;

  return (
    <div className="space-y-4">
      <PaymentBreakdown data={data} />

      <section className={card}>
        <p className="mb-3 text-xs font-medium text-stone-600">送金の方法をお選びください</p>
        <div role="tablist" aria-label="送金の方法" className="grid grid-cols-3 gap-1 rounded-full bg-stone-100 p-1">
          {METHODS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              id={`pay-tab-${m.key}`}
              aria-selected={method === m.key}
              aria-controls={`pay-panel-${m.key}`}
              onClick={() => setMethod(m.key)}
              className={`min-h-[var(--inv-tap)] touch-manipulation rounded-full text-xs font-medium transition ${
                method === m.key ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`pay-panel-${method}`} aria-labelledby={`pay-tab-${method}`} className="mt-4">
          {method === "paypay" && (
            <div>
              <p className="text-sm leading-relaxed text-stone-600">PayPay アプリで送金リンクを開き、お手続きください。</p>
              <button
                type="button"
                onClick={() => setConfirmingPaypay(true)}
                className="mt-3 min-h-[var(--inv-tap)] w-full touch-manipulation rounded-full border border-stone-300 text-sm font-medium text-stone-800 transition hover:bg-stone-100"
              >
                PayPay で送金する
              </button>
            </div>
          )}
          {method === "cotra" && (
            <div>
              <p className="text-sm leading-relaxed text-stone-600">
                お使いの銀行アプリの「ことら送金」から、次の電話番号あてにお送りください。
              </p>
              <CopyRow label="電話番号" value={DUMMY_PAYMENT.cotraPhone} />
            </div>
          )}
          {method === "bank" && (
            <div>
              <p className="text-sm leading-relaxed text-stone-600">次の口座へお振り込みください。</p>
              <dl className="mt-3 space-y-1 text-sm text-stone-700">
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-stone-400">銀行</dt>
                  <dd>{bank.bankName}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-stone-400">支店</dt>
                  <dd>{bank.branchName}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-stone-400">名義</dt>
                  <dd>{bank.holder}</dd>
                </div>
              </dl>
              <CopyRow label={`口座番号（${bank.accountType}）`} value={bank.accountNumber} />
            </div>
          )}
        </div>
      </section>

      <button
        type="button"
        onClick={onPaid}
        className="min-h-[max(3rem,var(--inv-tap))] w-full touch-manipulation rounded-full bg-stone-900 px-6 text-sm font-medium text-white transition hover:bg-stone-700"
      >
        送金完了（振り込みました）
      </button>
      <p className="text-center text-[length:calc(11px*var(--inv-scale))] leading-relaxed text-stone-400">
        送金を終えたら押してください。新郎新婦が確認するまで「確認待ち」と表示されます。
      </p>

      {confirmingPaypay && <ConfirmPaypay amountYen={data.totalYen} onCancel={() => setConfirmingPaypay(false)} />}
    </div>
  );
}

/** 値とコピーボタン。LINE アプリ内ブラウザでコピーできないときは、長押しで選べるよう値を選択可能のまま残す */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setResult("copied");
    } catch (e) {
      console.error(e);
      setResult("failed");
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-stone-50 p-3">
      <p className="text-[length:calc(11px*var(--inv-scale))] text-stone-400">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="min-w-0 flex-1 select-all font-mono text-lg tracking-wider text-stone-900">{value}</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-[var(--inv-tap)] shrink-0 touch-manipulation rounded-full border border-stone-300 bg-white px-4 text-xs font-medium text-stone-700 transition hover:bg-stone-100"
        >
          コピーする
        </button>
      </div>
      {result === "copied" && (
        <p role="status" className="mt-1.5 text-xs text-emerald-700">
          コピーしました
        </p>
      )}
      {result === "failed" && (
        <p role="alert" className="mt-1.5 text-xs text-rose-700">
          コピーできませんでした。番号を長押しして選択してください。
        </p>
      )}
    </div>
  );
}

/**
 * PayPay のリンクを開く前の確認。★document.body へ Portal で出す★（ボトムナビ z-40 より上に確実に重ねる）
 * OK はリンク（<a>）にして、ポップアップブロックに掛からないようにする。
 */
function ConfirmPaypay({ amountYen, onCancel }: { amountYen: number; onCancel: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-paypay-title"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <h2 id="confirm-paypay-title" className="text-base font-semibold text-stone-900">
          {yen(amountYen)}のリンクを開きますか？
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-stone-500">PayPay の送金画面へ移動します。</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[var(--inv-tap)] touch-manipulation rounded-full border border-stone-200 text-sm text-stone-700 transition hover:bg-stone-100"
          >
            キャンセル
          </button>
          <a
            href={DUMMY_PAYMENT.paypayUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onCancel}
            className="flex min-h-[var(--inv-tap)] touch-manipulation items-center justify-center rounded-full bg-stone-900 text-sm font-medium text-white transition hover:bg-stone-700"
          >
            OK
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatusMessage({ icon, tone, children }: { icon: ReactNode; tone: "amber" | "emerald"; children: ReactNode }) {
  const color = tone === "amber" ? "text-amber-800" : "text-emerald-800";
  return (
    <section className={`${card} flex min-h-[50dvh] flex-col items-center justify-center gap-4 p-8 text-center`}>
      <span aria-hidden className={`flex ${color}`}>
        {icon}
      </span>
      <p role="status" className={`text-base font-medium leading-relaxed ${color}`}>
        {children}
      </p>
    </section>
  );
}
