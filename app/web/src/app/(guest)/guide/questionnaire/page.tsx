"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { postJson } from "@/lib/api-client";
import { GuideShell } from "@/components/guide/GuideShell";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { ATTENDANCE_LABEL, ATTENDANCE_OPTIONS, type Attendance } from "@/types/admin";
import { GUIDE_PATHS } from "@/config/guide";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2.5 text-base text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:bg-white";

type Answers = { realName: string; kana: string; attendance: Attendance; allergy: string };

/**
 * 出欠・アンケート。招待状（/invitation → /onboarding）で答えた内容を確かめ、直す。
 *
 * ★初期値は自分の guestPrivate から読む★ 本名・アレルギーは guests（全員が読める）には無い。
 *   Rules で本人は get できる。書き込みは /api/guest/questionnaire（Admin SDK）だけ。
 * ★出欠を変えて保存するときだけ確認のダイアログを出す★
 *   出欠は座席と料理の数に関わる。誤ってタップしたまま保存しないよう、もう一度押してもらう。
 *   アレルギーなどは確認なしで保存する。どちらの変更も管理画面に「変更あり」と出る（answers-server の★参照）。
 */
export default function GuideQuestionnairePage() {
  const { user } = useGuestSessionContext();
  const [saved, setSaved] = useState<Answers | null>(null);
  const [form, setForm] = useState<Answers | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    getDoc(doc(db, "guestPrivate", user.uid))
      .then((snap) => {
        if (!alive) return;
        const d = snap.data() ?? {};
        const a: Answers = {
          realName: typeof d.realName === "string" ? d.realName : "",
          kana: typeof d.kana === "string" ? d.kana : "",
          attendance: (d.attendance ?? "unanswered") as Attendance,
          allergy: typeof d.allergy === "string" ? d.allergy : "",
        };
        setSaved(a);
        setForm(a);
      })
      .catch((e) => {
        console.error(e);
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  function update(p: Partial<Answers>) {
    setForm((f) => (f ? { ...f, ...p } : f));
    setMessage(null);
  }

  const trimmed = form && {
    realName: form.realName.trim(),
    kana: form.kana.trim(),
    attendance: form.attendance,
    allergy: form.allergy.trim(),
  };
  const changed =
    !!trimmed &&
    !!saved &&
    (trimmed.realName !== saved.realName ||
      trimmed.kana !== saved.kana ||
      trimmed.attendance !== saved.attendance ||
      trimmed.allergy !== saved.allergy.trim());
  const attendanceChanged = !!trimmed && !!saved && trimmed.attendance !== saved.attendance;
  const valid = !!trimmed && trimmed.realName.length > 0 && trimmed.attendance !== "unanswered";
  const canSave = changed && valid && !busy;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    if (attendanceChanged) setConfirming(true);
    else void save();
  }

  async function save() {
    if (!trimmed) return;
    setConfirming(false);
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await postJson("/api/guest/questionnaire", trimmed);
      setSaved(trimmed);
      setForm(trimmed);
      setMessage("保存しました");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GuideShell>
      <h1 className="mb-4 font-serif text-xl tracking-wide text-stone-900">出欠・アンケート</h1>

      {loadError ? (
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
          ご回答を読み込めませんでした。時間をおいて開き直してください。
        </p>
      ) : !form ? (
        <div className="h-80 animate-pulse rounded-2xl bg-stone-200/60" />
      ) : (
        <form onSubmit={onSubmit} className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
          <p className="text-sm leading-relaxed text-stone-500">
            招待状でご回答いただいた内容です。変更があればこちらから直せます。
          </p>

          <fieldset className="mt-5">
            <legend className="text-xs font-medium text-stone-600">ご出欠</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {ATTENDANCE_OPTIONS.filter((o) => o.value !== "unanswered").map((o) => {
                const on = form.attendance === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => update({ attendance: o.value })}
                    aria-pressed={on}
                    className={`min-h-11 touch-manipulation rounded-xl border px-4 py-3 text-sm font-medium transition ${
                      on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            {attendanceChanged && saved && (
              <p className="mt-1.5 text-xs text-amber-700">
                {ATTENDANCE_LABEL[saved.attendance]} から {ATTENDANCE_LABEL[form.attendance]} に変更します（保存前に確認します）
              </p>
            )}
          </fieldset>

          <label className="mt-5 block">
            <span className="text-xs font-medium text-stone-600">食物アレルギー・苦手なもの（任意）</span>
            <textarea
              value={form.allergy}
              onChange={(e) => update({ allergy: e.target.value })}
              rows={3}
              maxLength={500}
              placeholder="例）えび・かに、そば"
              className={`${inputClass} resize-none leading-relaxed`}
            />
            <span className="mt-1 block text-[11px] text-stone-400">この内容は新郎新婦とご本人だけが見られます。</span>
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-stone-600">お名前（本名）</span>
            <input
              value={form.realName}
              onChange={(e) => update({ realName: e.target.value })}
              maxLength={40}
              required
              className={inputClass}
            />
            <span className="mt-1 block text-[11px] text-stone-400">席次表のご用意に使います。他のゲストには表示されません。</span>
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-stone-600">ふりがな（任意）</span>
            <input value={form.kana} onChange={(e) => update({ kana: e.target.value })} maxLength={40} className={inputClass} />
          </label>

          <p className="mt-4 text-[11px] leading-relaxed text-stone-400">
            ゲストブックに表示するニックネームは、ゲストブックのマイページで変更できます。
          </p>

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2.5 text-sm leading-relaxed text-rose-700">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="mt-4 text-center text-sm text-emerald-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSave}
            className="mt-5 min-h-11 w-full touch-manipulation rounded-full bg-stone-900 px-6 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
          >
            {busy ? "保存中…" : "保存する"}
          </button>
        </form>
      )}

      <Link
        href={GUIDE_PATHS.home}
        className="mt-4 flex min-h-11 touch-manipulation items-center justify-center rounded-full text-sm text-stone-500 transition hover:bg-stone-100"
      >
        ご案内に戻る
      </Link>

      {confirming && saved && form && (
        <ConfirmAttendance
          from={saved.attendance}
          to={form.attendance}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void save()}
        />
      )}
    </GuideShell>
  );
}

/** 出欠の変更の確認。★document.body へ Portal で出す★（ボトムナビ z-40 より上に確実に重ねる） */
function ConfirmAttendance({
  from,
  to,
  onCancel,
  onConfirm,
}: {
  from: Attendance;
  to: Attendance;
  onCancel: () => void;
  onConfirm: () => void;
}) {
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
      aria-labelledby="confirm-attendance-title"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <h2 id="confirm-attendance-title" className="text-base font-semibold text-stone-900">
          本当に出欠を変更しますか？
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          {ATTENDANCE_LABEL[from]} → <span className="font-semibold text-stone-900">{ATTENDANCE_LABEL[to]}</span>
        </p>
        <p className="mt-1 text-xs leading-relaxed text-stone-500">※変更内容は新郎新婦へ通知されます。</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 touch-manipulation rounded-full border border-stone-200 text-sm text-stone-700 transition hover:bg-stone-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 touch-manipulation rounded-full bg-stone-900 text-sm font-medium text-white transition hover:bg-stone-700"
          >
            変更を確定する
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
