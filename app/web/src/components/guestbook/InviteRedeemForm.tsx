"use client";

import { useState, type FormEvent } from "react";
import type { User } from "firebase/auth";

/**
 * setCustomUserClaims の直後は反映に僅かなラグが出ることがあるため、
 * 期待したタグが乗るまで短くリトライしてから諦める。
 */
async function waitForTags(
  refreshTags: () => Promise<string[]>,
  expected: string[],
): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const next = await refreshTags();
    if (expected.every((t) => next.includes(t))) return;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
}

export function InviteRedeemForm({
  user,
  refreshTags,
  onRedeemed,
}: {
  user: User;
  refreshTags: () => Promise<string[]>;
  onRedeemed: (welcomeMessage: string) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;

    setBusy(true);
    setError(null);

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/invite/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ code }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        tags?: string[];
        welcomeMessage?: string;
      };

      if (!res.ok || !data.ok) {
        setError(data.message ?? "引き換えに失敗しました");
        return;
      }

      // ★ここでトークンを強制更新しないとタイムラインは解放されない★
      await waitForTags(refreshTags, data.tags ?? []);
      onRedeemed(data.welcomeMessage ?? "ようこそ！");
    } catch {
      setError("通信に失敗しました。電波状況をご確認ください");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm"
    >
      <h2 className="font-serif text-lg text-stone-900">招待コードを入力</h2>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">
        招待状に記載されたコードを入力すると、
        <br />
        ゲストブックが開きます。
      </p>

      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={64}
        placeholder="WEDDING2026"
        className="mt-5 w-full rounded-xl border border-stone-200 bg-stone-50/50 px-4 py-3 text-center font-mono text-base tracking-widest text-stone-800 outline-none placeholder:tracking-normal placeholder:text-stone-300 focus:border-stone-400 focus:bg-white"
      />

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="mt-4 w-full rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
      >
        {busy ? "確認中…" : "開く"}
      </button>
    </form>
  );
}
