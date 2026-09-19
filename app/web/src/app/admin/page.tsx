"use client";

import { useMemo } from "react";
import { auth } from "@/lib/firebase";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useAdminGuests } from "@/hooks/useAdminGuests";
import { GuestTable } from "@/components/admin/GuestTable";
import { ATTENDANCE_OPTIONS, type Attendance } from "@/types/admin";

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useGuestSession();
  const { rows, loading, error } = useAdminGuests(isAdmin);

  const stats = useMemo(() => {
    const by: Record<string, number> = { pending: 0 };
    for (const r of rows) {
      by[r.attendance] = (by[r.attendance] ?? 0) + 1;
      if (r.isRegistered && !r.isApproved) by.pending += 1;
    }
    return by;
  }, [rows]);

  async function onSave(uid: string, patch: Record<string, unknown>) {
    const current = auth.currentUser;
    if (!current) throw new Error("サインインし直してください");

    const res = await fetch("/api/admin/update-guest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await current.getIdToken()}`,
      },
      body: JSON.stringify({ uid, ...patch }),
    });

    const data = (await res.json()) as { ok?: boolean; message?: string };
    if (!res.ok || !data.ok) throw new Error(data.message ?? "保存に失敗しました");
  }

  if (authLoading) {
    return <main className="min-h-screen bg-stone-50 p-8"><div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" /></main>;
  }

  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8">
        <div className="max-w-sm rounded-2xl border border-stone-200 bg-white p-8 text-center">
          <p className="font-medium text-stone-800">管理者専用ページです</p>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            アクセスするには <code className="text-xs">admin</code> クレームが必要です。
            <br />
            <code className="text-xs">node scripts/make-admin.mjs &lt;uid&gt;</code>
            {" "}を実行してからリロードしてください。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl text-stone-900">ゲスト管理</h1>
            <p className="mt-1 text-sm text-stone-500">
              青い行は承認待ちです。「承認する」を押すと初期タグが付与され、ゲストの画面が自動で開きます。
            </p>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <p className="tabular-nums text-lg font-semibold text-sky-700">{stats.pending ?? 0}</p>
              <p className="text-[11px] text-stone-400">未承認</p>
            </div>
            {ATTENDANCE_OPTIONS.map((o) => (
              <div key={o.value} className="text-center">
                <p className="tabular-nums text-lg font-semibold text-stone-800">
                  {stats[o.value as Attendance] ?? 0}
                </p>
                <p className="text-[11px] text-stone-400">{o.label}</p>
              </div>
            ))}
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p className="font-medium">読み込みに失敗しました（{error.code}）</p>
            <p className="mt-1">Rules の guestAdmin 開放が反映されているか確認してください。</p>
          </div>
        ) : loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-stone-200/60" />
        ) : (
          <GuestTable rows={rows} onSave={onSave} />
        )}
      </div>
    </main>
  );
}
