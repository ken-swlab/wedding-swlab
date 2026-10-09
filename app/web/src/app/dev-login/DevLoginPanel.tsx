"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { DEV_ACCOUNTS } from "@/config/emulator";

/** 開発用ログインの中身（page.tsx の★参照）。テスト用アカウントを選んで入る */
export function DevLoginPanel() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  async function login(key: string) {
    setBusy(key);
    setError(null);
    try {
      // ログイン前なので api-client（ID トークン必須）ではなく素の fetch で呼ぶ（/api/auth/line と同じ）
      const res = await fetch("/api/auth/dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: key }),
        cache: "no-store",
      });
      const text = await res.text();
      let data: { ok?: boolean; customToken?: string; home?: string; message?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        /* 本文が JSON でない（開発サーバーのエラー画面など） */
      }
      if (!res.ok || !data.ok || !data.customToken) {
        throw new Error(data.message ?? `ログインに失敗しました (${res.status})`);
      }
      // 別のテスト用アカウントから切り替えるときは、先に抜けてから入る
      if (auth.currentUser) await signOut(auth);
      await signInWithCustomToken(auth, data.customToken);
      router.replace(data.home ?? "/guestbook");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログインに失敗しました");
      setBusy(null);
    }
  }

  return (
    <main className="min-h-dvh bg-stone-50 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))]">
      <div className="mx-auto max-w-sm space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
          <p className="font-semibold">開発用ログイン（エミュレーター）</p>
          <p className="mt-1">
            ここで入るアカウントとデータは手元のエミュレーターだけのもので、本番には届きません。
            写真のアップロード・顔検出・AI・音声合成は使えません。
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
          <p className="text-sm text-stone-600">
            {user ? `いまのアカウント: ${user.uid}` : "ログインしていません"}
          </p>
          <div className="mt-3 space-y-2">
            {DEV_ACCOUNTS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => void login(a.key)}
                disabled={busy !== null}
                className="min-h-11 w-full touch-manipulation rounded-full bg-stone-900 px-4 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
              >
                {busy === a.key ? "ログイン中…" : `${a.label}として入る`}
              </button>
            ))}
            {user && (
              <button
                type="button"
                onClick={() => void signOut(auth)}
                disabled={busy !== null}
                className="min-h-11 w-full touch-manipulation rounded-full border border-stone-200 px-4 text-sm text-stone-600 transition hover:bg-stone-50 disabled:opacity-40"
              >
                ログアウト
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
