"use client";

import { useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { ATTENDANCE_OPTIONS, type Attendance } from "@/types/admin";

export function OnboardingForm({
  user,
  initialNickname,
  onDone,
}: {
  user: User;
  initialNickname?: string;
  onDone: () => void;
}) {
  const [nickname, setNickname] = useState(initialNickname || user.displayName || "");
  const [attendance, setAttendance] = useState<Attendance>("unanswered");
  const [allergy, setAllergy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !nickname.trim() || attendance === "unanswered") return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/guest/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ nickname: nickname.trim(), attendance, allergy }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "送信に失敗しました");
        return;
      }
      onDone();
    } catch {
      setError("通信に失敗しました。電波状況をご確認ください");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="text-center">
        <h2 className="font-serif text-lg text-stone-900">ご出席のご確認</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          ご入力いただいた内容を新郎新婦が確認のうえ、
          <br />
          ゲストブックを開放いたします。
        </p>
      </div>

      <label className="mt-6 block">
        <span className="text-xs font-medium text-stone-600">お名前（ゲストブックに表示されます）</span>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          required
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2.5 text-[15px] text-stone-800 outline-none focus:border-stone-400 focus:bg-white"
        />
      </label>

      <fieldset className="mt-5">
        <legend className="text-xs font-medium text-stone-600">ご出欠</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {ATTENDANCE_OPTIONS.filter((o) => o.value !== "unanswered").map((o) => {
            const on = attendance === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setAttendance(o.value)}
                aria-pressed={on}
                className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                  on
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-5 block">
        <span className="text-xs font-medium text-stone-600">
          食物アレルギー・苦手なもの（任意）
        </span>
        <textarea
          value={allergy}
          onChange={(e) => setAllergy(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="例）えび・かに、そば"
          className="mt-1.5 w-full resize-none rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2.5 text-sm leading-relaxed text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:bg-white"
        />
        <span className="mt-1 block text-[11px] text-stone-400">
          この内容は新郎新婦とご本人だけが見られます。
        </span>
      </label>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={busy || !nickname.trim() || attendance === "unanswered"}
        className="mt-6 w-full rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
      >
        {busy ? "送信中…" : "送信する"}
      </button>
    </form>
  );
}
