"use client";
import { TAG_DEFS } from "@/config/tags";
import { postJson } from "@/lib/api-client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useAdminGuests } from "@/hooks/useAdminGuests";
import { compareGuests } from "@/lib/roster";
import { INVITATION_STATUSES, invitationDef } from "@/config/roster";
import { RosterImportDialog } from "@/components/admin/RosterImportDialog";
import type { GuestRow } from "@/types/admin";

type Draft = Partial<Pick<GuestRow, "displayName" | "kana" | "invitationStatus">>;

async function callRoster(payload: Record<string, unknown>) {
  return postJson("/api/admin/roster", payload);
}

export default function AdminRosterPage() {
  const { user, isAdmin, loading: authLoading } = useGuestSession();
  const { rows, loading, error } = useAdminGuests(isAdmin);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [tagFilter, setTagFilter] = useState<string>("");
  const [registered, setRegistered] = useState<"" | "yes" | "no">("");
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState(false);
  const [merging, setMerging] = useState<GuestRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function field<K extends keyof Draft>(row: GuestRow, key: K): NonNullable<Draft[K]> {
    const d = drafts[row.uid]?.[key];
    return (d !== undefined ? d : row[key]) as NonNullable<Draft[K]>;
  }
  function patch(uid: string, p: Draft) {
    setDrafts((prev) => ({ ...prev, [uid]: { ...prev[uid], ...p } }));
  }
  function isDirty(row: GuestRow) {
    const d = drafts[row.uid];
    if (!d) return false;
    return (["displayName", "kana", "invitationStatus"] as const)
      .some((k) => d[k] !== undefined && d[k] !== row[k]);
  }

  const save = useCallback(async (row: GuestRow) => {
    const d = drafts[row.uid];
    if (!d) return;
    setSaving((s) => ({ ...s, [row.uid]: true }));
    try {
      await callRoster({
        action: "upsert",
        uid: row.uid,
        displayName: d.displayName ?? row.displayName,
        kana: d.kana ?? row.kana,
        invitationStatus: d.invitationStatus ?? row.invitationStatus,
      });
      setDrafts((p) => { const n = { ...p }; delete n[row.uid]; return n; });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving((s) => ({ ...s, [row.uid]: false }));
    }
  }, [drafts]);

  const stats = useMemo(() => {
    const by: Record<string, number> = {};
    let reg = 0;
    for (const r of rows) {
      for (const t of r.tags) by[t] = (by[t] ?? 0) + 1;
      if (r.isRegistered) reg += 1;
    }
    return { by, reg, total: rows.length };
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !tagFilter || r.tags.includes(tagFilter))
      .filter((r) => registered === "" ? true : registered === "yes" ? r.isRegistered : !r.isRegistered)
      .filter((r) => !needle || `${r.displayName} ${r.kana} ${r.nickname} ${r.realName}`.toLowerCase().includes(needle))
      .sort(compareGuests);
  }, [rows, tagFilter, registered, q]);

  const dirtyRows = visible.filter(isDirty);
  const loggedIn = useMemo(() => rows.filter((r) => !r.isPreRegistered), [rows]);

  if (authLoading) return <main className="min-h-screen bg-stone-50 p-8"><div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" /></main>;
  if (!user || !isAdmin) return <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8"><p className="text-sm text-stone-600">管理者専用ページです</p></main>;

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-5">
          <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">← ゲスト管理に戻る</Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-serif text-xl text-stone-900">招待予定者リスト</h1>
              <p className="mt-1 text-sm text-stone-500">本人がログインする前でも、顔やエピソードの紐付け先として使えます。</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center"><p className="tabular-nums text-lg font-semibold text-stone-900">{stats.total}</p><p className="text-[11px] text-stone-400">総数</p></div>
              <div className="text-center"><p className="tabular-nums text-lg font-semibold text-emerald-700">{stats.reg}</p><p className="text-[11px] text-stone-400">登録済</p></div>
              <div className="text-center"><p className="tabular-nums text-lg font-semibold text-stone-400">{stats.total - stats.reg}</p><p className="text-[11px] text-stone-400">未登録</p></div>
            </div>
          </div>
        </header>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => setTagFilter("")}
              className={`rounded-full px-3 py-1.5 text-sm ${!tagFilter ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-100"}`}>
              すべて
            </button>
            {TAG_DEFS.filter((t) => t.community).map((t) => (
              <button key={t.id} type="button" onClick={() => setTagFilter(t.id)}
                className={`rounded-full px-3 py-1.5 text-sm ${tagFilter === t.id ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-100"}`}>
                {t.label}
                <span className="ml-1.5 tabular-nums text-xs opacity-60">{stats.by[t.id] ?? 0}</span>
              </button>
            ))}
          </div>
          <select value={registered} onChange={(e) => setRegistered(e.target.value as "" | "yes" | "no")} className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm">
            <option value="">登録: すべて</option><option value="yes">登録済のみ</option><option value="no">未登録のみ</option>
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・ふりがなで検索" className="min-w-[160px] flex-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-stone-400" />
          <button type="button" onClick={() => setImporting(true)} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">一括追加</button>
          <button type="button" onClick={() => void callRoster({ action: "upsert", displayName: "新しいゲスト" }).then(() => setToast("1名追加しました")).catch((e) => setToast(e.message))} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">＋ 個別追加</button>
          <button type="button" disabled={dirtyRows.length === 0} onClick={() => { void (async () => { for (const r of dirtyRows) await save(r); setToast("保存しました"); })(); }} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">まとめて保存{dirtyRows.length > 0 ? ` (${dirtyRows.length})` : ""}</button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">読み込みに失敗しました（{error.code}）</div>
        ) : loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-stone-200/60" />
        ) : visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-12 text-center text-sm text-stone-400">該当するゲストがいません。「一括追加」から名簿を投入してください。</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[840px] border-collapse text-sm">
              <thead className="bg-stone-50 text-left text-xs font-semibold text-stone-500">
                <tr><th className="border-b border-stone-200 px-3 py-2">名前</th><th className="w-44 border-b border-stone-200 px-3 py-2">ふりがな</th><th className="w-28 border-b border-stone-200 px-3 py-2">招待</th><th className="w-28 border-b border-stone-200 px-3 py-2">状態</th><th className="w-32 border-b border-stone-200 px-3 py-2"></th></tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const dirty = isDirty(row);
                  return (
                    <tr key={row.uid} className={dirty ? "bg-amber-50/60" : "hover:bg-stone-50/60"}>
                      <td className="border-b border-stone-200 px-2 py-1.5">
                        <input value={field(row, "displayName")} onChange={(e) => patch(row.uid, { displayName: e.target.value })} maxLength={40} className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 font-medium text-stone-800 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none" />
                      </td>
                      <td className="border-b border-stone-200 px-2 py-1.5">
                        <input value={field(row, "kana")} onChange={(e) => patch(row.uid, { kana: e.target.value })} maxLength={40} placeholder="まえかわ たろう" className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-stone-600 placeholder:text-stone-300 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none" />
                      </td>
                      <td className="border-b border-stone-200 px-2 py-1.5">
                        <select value={field(row, "invitationStatus")} onChange={(e) => patch(row.uid, { invitationStatus: e.target.value })} className={`w-full rounded-md px-2 py-1 text-xs font-medium ${invitationDef(field(row, "invitationStatus")).className}`}>
                          {INVITATION_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="border-b border-stone-200 px-3 py-2">
                        {row.isRegistered ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">登録済</span> : <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">未登録</span>}
                      </td>
                      <td className="border-b border-stone-200 px-2 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {dirty && <button type="button" onClick={() => void save(row)} disabled={saving[row.uid]} className="rounded-md bg-stone-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">{saving[row.uid] ? "…" : "保存"}</button>}
                          {row.isPreRegistered && !dirty && (
                            <>
                              <button type="button" onClick={() => setMerging(row)} className="rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-500 hover:bg-stone-50">統合</button>
                              <button type="button" onClick={() => void callRoster({ action: "delete", uid: row.uid }).then(() => setToast("削除しました")).catch((e) => setToast(e.message))} className="rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-400 hover:bg-rose-50 hover:text-rose-600">削除</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {importing && (
        <RosterImportDialog existing={rows} onClose={() => setImporting(false)} onImport={async (imported) => { const r = await callRoster({ action: "bulk", rows: imported }); setToast(`${r.created ?? 0} 名を追加しました`); }} />
      )}

      {merging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white">
            <header className="border-b border-stone-100 p-4">
              <h2 className="font-serif text-lg text-stone-900">本人と統合</h2>
              <p className="mt-1 text-xs leading-relaxed text-stone-500">「{merging.displayName}」に紐付いた顔とエピソードを、ログイン済みの本人アカウントへ移します。この操作は取り消せません。</p>
            </header>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
              {loggedIn.length === 0 ? <li className="p-8 text-center text-xs text-stone-400">ログイン済みのゲストがまだいません</li> : (
                loggedIn.map((g) => (
                  <li key={g.uid}>
                    <button type="button" onClick={() => void callRoster({ action: "merge", fromUid: merging.uid, toUid: g.uid }).then((r) => { setToast(`統合しました（顔 ${r.faces} 件 / 投稿 ${r.posts} 件）`); setMerging(null); }).catch((e) => setToast(e.message))} className="w-full rounded-lg p-2 text-left hover:bg-stone-100">
                      <span className="block text-sm text-stone-800">{g.nickname || g.displayName}</span>
                      <span className="block text-[10px] text-stone-400">{g.displayName}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <footer className="border-t border-stone-100 p-3"><button type="button" onClick={() => setMerging(null)} className="w-full rounded-full py-2 text-sm text-stone-500 hover:bg-stone-100">キャンセル</button></footer>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-sm text-white shadow-lg">{toast}</div>}
    </main>
  );
}
