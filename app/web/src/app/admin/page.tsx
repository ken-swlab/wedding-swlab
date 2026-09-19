"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { postJson } from "@/lib/api-client";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useAdminGuests } from "@/hooks/useAdminGuests";
import { GuestTable, type GuestPatch } from "@/components/admin/GuestTable";
import { adminName } from "@/lib/names";
import { compareGuests } from "@/lib/roster";
import { tagDef } from "@/config/tags";
import { ATTENDANCE_LABEL, ATTENDANCE_OPTIONS, PAYMENT_LABEL, type Attendance, type GuestRow } from "@/types/admin";

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useGuestSession();
  const { rows, loading, error } = useAdminGuests(isAdmin);
  const [q, setQ] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const onSave = useCallback(async (uid: string, patch: GuestPatch) => {
    await postJson("/api/admin/update-guest", { uid, ...patch });
  }, []);

  const onApprove = useCallback(async (row: GuestRow, preUid: string) => {
    if (preUid) await postJson("/api/admin/roster", { action: "merge", fromUid: preUid, toUid: row.uid });
    await postJson("/api/admin/update-guest", { uid: row.uid, isApproved: true });
    setToast(preUid ? `${adminName(row)} を承認し、名簿と紐付けました` : `${adminName(row)} を承認しました`);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => `${r.displayName} ${r.realName} ${r.nickname} ${r.kana} ${r.lineDisplayName}`.toLowerCase().includes(needle));
  }, [rows, q]);

  const preGuests = useMemo(() => rows.filter((r) => r.isPreRegistered && !r.isRegistered), [rows]);
  const pending = useMemo(() => filtered.filter((r) => r.isRegistered && !r.isApproved).sort(compareGuests), [filtered]);
  const approved = useMemo(() => filtered.filter((r) => r.isRegistered && r.isApproved).sort(compareGuests), [filtered]);

  const stats = useMemo(() => {
    const by: Record<string, number> = {};
    for (const r of rows) if (r.isRegistered && r.isApproved) by[r.attendance] = (by[r.attendance] ?? 0) + 1;
    return by;
  }, [rows]);

  function exportCsv() {
    const head = ["uid", "名前", "ニックネーム", "LINE名", "承認", "出欠", "アレルギー", "送金", "タグ", "メモ"];
    const body = [...pending, ...approved].map((r) => [r.uid, adminName(r), r.nickname, r.lineDisplayName, r.isApproved ? "済" : "未", ATTENDANCE_LABEL[r.attendance], r.allergy, PAYMENT_LABEL[r.paymentStatus], r.tags.map((t) => tagDef(t).label).join(" "), r.aiMemo]);
    const csv = [head, ...body].map((c) => c.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `guests_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (authLoading) return <main className="min-h-screen bg-stone-50 p-8"><div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" /></main>;
  if (!user || !isAdmin) return <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8"><div className="max-w-sm rounded-2xl border border-stone-200 bg-white p-8 text-center"><p className="font-medium text-stone-800">管理者専用ページです</p></div></main>;

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-[1600px] px-4 py-8">
        <header className="mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-xl text-stone-900">ゲスト管理</h1>
            <Link href="/admin/guests" className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 hover:bg-stone-100">招待予定者リスト →</Link>
            <Link href="/admin/episodes" className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 hover:bg-stone-100">エピソード管理 →</Link>
            <Link href="/admin/faces" className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 hover:bg-stone-100">顔の名寄せ →</Link>
            <div className="ml-auto flex items-center gap-4 text-sm">
              <div className="text-center"><p className="tabular-nums text-lg font-semibold text-sky-700">{pending.length}</p><p className="text-[11px] text-stone-400">承認待ち</p></div>
              {ATTENDANCE_OPTIONS.map((o) => (
                <div key={o.value} className="text-center"><p className="tabular-nums text-lg font-semibold text-stone-800">{stats[o.value as Attendance] ?? 0}</p><p className="text-[11px] text-stone-400">{o.label}</p></div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・ニックネーム・LINE名で検索" className="min-w-[220px] flex-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-stone-400" />
            <button type="button" onClick={exportCsv} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">CSV</button>
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">読み込みに失敗しました</div> : loading ? <div className="h-64 animate-pulse rounded-2xl bg-stone-200/60" /> : (
          <div className="space-y-8">
            <section>
              <div className="mb-2 flex items-baseline gap-2"><h2 className="text-sm font-semibold text-stone-800">承認待ち</h2><p className="text-xs text-stone-400">LINE ログイン直後のゲストです。名簿の誰かを選んでから「承認する」を押すと紐付きます。</p></div>
              <GuestTable mode="pending" rows={pending} preGuests={preGuests} onSave={onSave} onApprove={onApprove} />
            </section>
            <section>
              <div className="mb-2 flex items-baseline gap-2"><h2 className="text-sm font-semibold text-stone-800">本登録（承認済み）</h2></div>
              <GuestTable mode="approved" rows={approved} onSave={onSave} />
            </section>
          </div>
        )}
      </div>
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-sm text-white shadow-lg">{toast}</div>}
    </main>
  );
}
