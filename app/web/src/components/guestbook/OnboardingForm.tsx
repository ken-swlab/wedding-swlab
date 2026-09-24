"use client";

import { useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { postJson } from "@/lib/api-client";
import { ATTENDANCE_OPTIONS, type Attendance } from "@/types/admin";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2.5 text-[15px] text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:bg-white";

export function OnboardingForm({
  user,
  initialNickname,
  /** 初回登録のときだけ true。2回目以降（入力内容の修正）は求めない */
  needsPasscode,
  onDone,
}: {
  user: User;
  initialNickname?: string;
  needsPasscode: boolean;
  onDone: () => void;
}) {
  const [passcode, setPasscode] = useState("");
  const [realName, setRealName] = useState("");
  const [kana, setKana] = useState("");
  const [nickname, setNickname] = useState(initialNickname || "");
  const [attendance, setAttendance] = useState<Attendance>("unanswered");
  const [allergy, setAllergy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    realName.trim().length > 0 &&
    nickname.trim().length > 0 &&
    attendance !== "unanswered" &&
    (!needsPasscode || passcode.trim().length > 0);

  /** 上限に達してロックされた状態。入力を閉じて誤送信を防ぐ */
  const locked = error !== null && error.includes("上限に達し");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !ready || locked) return;
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/guest/register", {
        ...(needsPasscode ? { passcode: passcode.trim() } : {}),
        realName: realName.trim(),
        kana: kana.trim(),
        nickname: nickname.trim(),
        attendance,
        allergy,
      });
      onDone();
    } catch (e) {
      // サーバーが残り回数やロック時間を文言に含めて返す
      setError(e instanceof Error ? e.message : "送信に失敗しました");
      setPasscode("");
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

      {needsPasscode && (
        <label className="mt-6 block rounded-xl bg-stone-50 p-4">
          <span className="text-xs font-medium text-stone-700">パスコード</span>
          <input
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            disabled={locked}
            required
            maxLength={16}
            inputMode="numeric"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="＿＿＿＿"
            className={`${inputClass} text-center text-lg tracking-[0.5em] disabled:opacity-50`}
          />
          <span className="mt-1.5 block text-[11px] leading-relaxed text-stone-400">
            新郎新婦からお伝えした数字をご入力ください。
          </span>
        </label>
      )}

      <label className="mt-6 block">
        <span className="text-xs font-medium text-stone-600">お名前（本名）</span>
        <input value={realName} onChange={(e) => setRealName(e.target.value)} maxLength={40} required placeholder="前川 太郎" className={inputClass} />
        <span className="mt-1 block text-[11px] text-stone-400">席次表のご用意に使います。他のゲストには表示されません。</span>
      </label>

      <label className="mt-4 block">
        <span className="text-xs font-medium text-stone-600">ふりがな（任意）</span>
        <input value={kana} onChange={(e) => setKana(e.target.value)} maxLength={40} placeholder="まえかわ たろう" className={inputClass} />
      </label>

      <label className="mt-4 block">
        <span className="text-xs font-medium text-stone-600">ニックネーム（ゲストブックに表示されます）</span>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} required placeholder="たろう" className={inputClass} />
      </label>

      <fieldset className="mt-5">
        <legend className="text-xs font-medium text-stone-600">ご出欠</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {ATTENDANCE_OPTIONS.filter((o) => o.value !== "unanswered").map((o) => {
            const on = attendance === o.value;
            return (
              <button key={o.value} type="button" onClick={() => setAttendance(o.value)} aria-pressed={on} className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"}`}>{o.label}</button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-5 block">
        <span className="text-xs font-medium text-stone-600">食物アレルギー・苦手なもの（任意）</span>
        <textarea value={allergy} onChange={(e) => setAllergy(e.target.value)} rows={3} maxLength={500} placeholder="例）えび・かに、そば" className="mt-1.5 w-full resize-none rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2.5 text-sm leading-relaxed text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:bg-white" />
        <span className="mt-1 block text-[11px] text-stone-400">この内容は新郎新婦とご本人だけが見られます。</span>
      </label>

      {error && (
        <p
          role="alert"
          className={`mt-4 rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
            locked ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"
          }`}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !ready || locked}
        className="mt-6 w-full rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
      >
        {busy ? "送信中…" : "送信する"}
      </button>

      <p className="mt-3 text-center text-[11px] text-stone-400">
        {user.displayName ? `${user.displayName} として回答します` : ""}
      </p>
    </form>
  );
}
