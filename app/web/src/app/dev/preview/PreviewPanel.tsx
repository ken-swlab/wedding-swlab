"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import previewScreens from "@/config/preview-screens.json";

type Screen = { key: string; group: string; label: string; account: "none" | "guest" | "admin"; path: string };
const SCREENS = previewScreens.screens as Screen[];

/** テスト用アカウントに入る（DevLoginPanel と同じ /api/auth/dev。エミュレーターでしか動かない） */
async function signInAs(account: "guest" | "admin") {
  const res = await fetch("/api/auth/dev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; customToken?: string; message?: string };
  if (!res.ok || !data.ok || !data.customToken) throw new Error(data.message ?? `ログインできませんでした (${res.status})`);
  if (auth.currentUser) await signOut(auth);
  await signInWithCustomToken(auth, data.customToken);
}

/** 見本の一覧と、?screen= で開いたときの切り替え（page.tsx の★参照） */
export function PreviewPanel({ screenKey }: { screenKey: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!screenKey) return;
    const s = SCREENS.find((x) => x.key === screenKey);
    if (!s) return;
    let alive = true;
    void (async () => {
      try {
        if (s.account === "none") {
          if (auth.currentUser) await signOut(auth);
        } else {
          await signInAs(s.account);
        }
        if (alive) router.replace(s.path);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "開けませんでした");
      }
    })();
    return () => {
      alive = false;
    };
  }, [screenKey, router]);

  const groups = [...new Set(SCREENS.map((s) => s.group))];
  return (
    <main className="min-h-dvh bg-stone-50 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))]">
      <div className="mx-auto max-w-sm space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
          <p className="font-semibold">画面の見本（開発用）</p>
          <p className="mt-1">
            npm run dev:emulator で起動したときだけ使えます。データは手元のエミュレーターの架空のものです。
            撮影は npm run test:screens。
          </p>
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {screenKey && !error && <p role="status" className="text-sm text-stone-500">開いています…</p>}
        {groups.map((g) => (
          <section key={g} className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-stone-800">{g}</h2>
            <ul className="space-y-1">
              {SCREENS.filter((s) => s.group === g).map((s) => (
                <li key={s.key}>
                  {/* ★Link ではなく a★ 同じページへのクライアント遷移では ?screen= の読み直しが起きないので、ページごと開き直す */}
                  <a
                    href={`/dev/preview?screen=${s.key}`}
                    className="flex min-h-11 touch-manipulation items-center justify-between rounded-lg px-2 text-sm text-stone-700 hover:bg-stone-50"
                  >
                    {s.label}
                    <span className="text-xs text-stone-400">{s.key}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
