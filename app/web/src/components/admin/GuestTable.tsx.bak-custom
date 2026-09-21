"use client";
import Image from "next/image";
import { useMemo, useState } from "react";
import { TAG_DEFS, tagDef } from "@/config/tags";
import { adminName } from "@/lib/names";
import { compareGuests } from "@/lib/roster";
import { ATTENDANCE_OPTIONS, PAYMENT_OPTIONS, type Attendance, type GuestRow, type PaymentStatus } from "@/types/admin";

type Draft = Partial<Pick<GuestRow, "nickname" | "tags" | "attendance" | "allergy" | "paymentStatus" | "aiMemo">>;
export type GuestPatch = Draft & { isApproved?: boolean };
type SaveState = "idle" | "saving" | "done" | "error";

const ATTENDANCE_STYLE: Record<Attendance, string> = { unanswered: "bg-stone-100 text-stone-600", attending: "bg-emerald-50 text-emerald-700", declined: "bg-rose-50 text-rose-700" };
const PAYMENT_STYLE: Record<PaymentStatus, string> = { none: "bg-stone-100 text-stone-600", remitted: "bg-amber-50 text-amber-700", confirmed: "bg-emerald-50 text-emerald-700" };
function sameTags(a: string[], b: string[]) { return a.length === b.length && a.every((t, i) => t === b[i]); }

export function GuestTable({ mode, rows, preGuests = [], onSave, onApprove }: { mode: "pending" | "approved"; rows: GuestRow[]; preGuests?: GuestRow[]; onSave: (uid: string, patch: GuestPatch) => Promise<void>; onApprove?: (row: GuestRow, preUid: string) => Promise<void>; }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [linkTo, setLinkTo] = useState<Record<string, string>>({});

  function field<K extends keyof Draft>(row: GuestRow, key: K): NonNullable<Draft[K]> { const d = drafts[row.uid]?.[key]; return (d !== undefined ? d : row[key]) as NonNullable<Draft[K]>; }
  function patch(uid: string, p: Draft) { setDrafts((prev) => ({ ...prev, [uid]: { ...prev[uid], ...p } })); setStates((prev) => ({ ...prev, [uid]: "idle" })); }
  function isDirty(row: GuestRow): boolean {
    const d = drafts[row.uid]; if (!d) return false;
    if (d.tags !== undefined && !sameTags(d.tags, row.tags)) return true;
    return (["nickname", "attendance", "allergy", "paymentStatus", "aiMemo"] as const).some((k) => d[k] !== undefined && d[k] !== row[k]);
  }

  async function run(row: GuestRow, task: Promise<void>) {
    setStates((p) => ({ ...p, [row.uid]: "saving" })); setErrors((p) => ({ ...p, [row.uid]: "" }));
    try { await task; setDrafts((p) => { const n = { ...p }; delete n[row.uid]; return n; }); setStates((p) => ({ ...p, [row.uid]: "done" })); } 
    catch (e) { setStates((p) => ({ ...p, [row.uid]: "error" })); setErrors((p) => ({ ...p, [row.uid]: e instanceof Error ? e.message : "失敗しました" })); }
  }

  const sortedPre = useMemo(() => [...preGuests].sort(compareGuests), [preGuests]);
  const dirtyRows = rows.filter(isDirty);

  if (rows.length === 0) return <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">{mode === "pending" ? "承認待ちのゲストはいません" : "承認済みのゲストはまだいません"}</p>;

  return (
    <div>
      {dirtyRows.length > 0 && <div className="mb-2 flex justify-end"><button type="button" onClick={() => { void (async () => { for (const r of dirtyRows) await run(r, onSave(r.uid, drafts[r.uid] ?? {})); })(); }} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white">まとめて保存 ({dirtyRows.length})</button></div>}
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[1460px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-stone-50">
            <tr className="text-left text-xs font-semibold text-stone-500">
              <th className="sticky left-0 z-20 w-44 border-b border-r border-stone-200 bg-stone-50 px-3 py-2">名前</th>
              <th className="w-36 border-b border-stone-200 px-3 py-2">ニックネーム</th>
              <th className="w-44 border-b border-stone-200 px-3 py-2">LINE</th>
              <th className={`${mode === "pending" ? "w-64" : "w-28"} border-b border-stone-200 px-3 py-2`}>{mode === "pending" ? "紐付けて承認" : "承認"}</th>
              <th className="w-24 border-b border-stone-200 px-3 py-2">出欠</th>
              <th className="w-44 border-b border-stone-200 px-3 py-2">アレルギー</th>
              <th className="w-32 border-b border-stone-200 px-3 py-2">送金</th>
              <th className="w-60 border-b border-stone-200 px-3 py-2">タグ</th>
              <th className="min-w-[180px] border-b border-stone-200 px-3 py-2">AI用メモ</th>
              <th className="w-20 border-b border-stone-200 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const dirty = isDirty(row); const state = states[row.uid] ?? "idle"; const tags = field(row, "tags");
              const addable = TAG_DEFS.filter((t) => !tags.includes(t.id));
              const bg = dirty ? "bg-amber-50" : mode === "pending" ? "bg-sky-50/60" : "bg-white";
              return (
                <tr key={row.uid} className={`align-top ${dirty ? "bg-amber-50/60" : mode === "pending" ? "bg-sky-50/40" : "hover:bg-stone-50/60"}`}>
                  <td className={`sticky left-0 z-10 border-b border-r border-stone-200 px-3 py-2 ${bg}`}>
                    <p className="truncate font-medium text-stone-900" title={adminName(row)}>{adminName(row)}</p>
                    {row.kana && <p className="truncate text-[10px] text-stone-400">{row.kana}</p>}
                    <button type="button" title={row.uid} onClick={() => void navigator.clipboard?.writeText(row.uid)} className="font-mono text-[10px] text-stone-300 hover:text-stone-700">{row.uid.slice(0, 12)}…</button>
                  </td>
                  <td className="border-b border-stone-200 px-2 py-2">
                    <input value={field(row, "nickname")} onChange={(e) => patch(row.uid, { nickname: e.target.value })} maxLength={20} placeholder="未設定" className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-stone-800 placeholder:text-stone-300 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none" />
                  </td>
                  <td className="border-b border-stone-200 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-stone-200">{row.photoURL && <Image src={row.photoURL} alt="" fill sizes="32px" className="object-cover" />}</span>
                      <span className="min-w-0 truncate text-xs text-stone-500" title={row.lineDisplayName}>{row.lineDisplayName || "—"}</span>
                    </div>
                  </td>
                  <td className="border-b border-stone-200 px-2 py-2">
                    {mode === "pending" ? (
                      <div className="space-y-1.5">
                        <select value={linkTo[row.uid] ?? ""} onChange={(e) => setLinkTo((p) => ({ ...p, [row.uid]: e.target.value }))} className="w-full rounded-md border border-stone-200 bg-white px-2 py-1 text-xs"><option value="">紐付けない（新規ゲスト）</option>{sortedPre.map((g) => <option key={g.uid} value={g.uid}>{adminName(g)}{g.kana ? `（${g.kana}）` : ""}</option>)}</select>
                        <button type="button" disabled={state === "saving" || !onApprove} onClick={() => onApprove && void run(row, onApprove(row, linkTo[row.uid] ?? ""))} className="w-full rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50">{state === "saving" ? "処理中…" : "承認する"}</button>
                      </div>
                    ) : (<button type="button" onClick={() => void run(row, onSave(row.uid, { isApproved: false }))} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">✓ 承認済</button>)}
                  </td>
                  <td className="border-b border-stone-200 px-2 py-2">
                    <select value={field(row, "attendance")} onChange={(e) => patch(row.uid, { attendance: e.target.value as Attendance })} className={`w-full rounded-md px-2 py-1 text-xs font-medium ${ATTENDANCE_STYLE[field(row, "attendance")]}`}>{ATTENDANCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  </td>
                  <td className="border-b border-stone-200 px-2 py-2">
                    <textarea value={field(row, "allergy")} onChange={(e) => patch(row.uid, { allergy: e.target.value })} rows={2} maxLength={500} placeholder="—" className="w-full resize-y rounded border border-transparent bg-transparent px-1.5 py-1 text-xs leading-relaxed text-stone-700 placeholder:text-stone-300 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none" />
                  </td>
                  <td className="border-b border-stone-200 px-2 py-2">
                    <select value={field(row, "paymentStatus")} onChange={(e) => patch(row.uid, { paymentStatus: e.target.value as PaymentStatus })} className={`w-full rounded-md px-2 py-1 text-xs font-medium ${PAYMENT_STYLE[field(row, "paymentStatus")]}`}>{PAYMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  </td>
                  <td className="border-b border-stone-200 px-2 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {tags.map((t) => <span key={t} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tagDef(t).className}`}>{tagDef(t).label}<button type="button" onClick={() => patch(row.uid, { tags: tags.filter((x) => x !== t) })} className="opacity-50 hover:opacity-100">×</button></span>)}
                      {addable.length > 0 && (<select value="" onChange={(e) => { if (e.target.value) patch(row.uid, { tags: [...tags, e.target.value] }); }} className="rounded-full border border-dashed border-stone-300 bg-white px-1.5 py-0.5 text-[11px] text-stone-400"><option value="">＋</option>{addable.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>)}
                    </div>
                  </td>
                  <td className="border-b border-stone-200 px-2 py-2">
                    <textarea value={field(row, "aiMemo")} onChange={(e) => patch(row.uid, { aiMemo: e.target.value })} rows={2} maxLength={2000} placeholder="席次の希望など" className="w-full resize-y rounded border border-transparent bg-transparent px-1.5 py-1 text-xs leading-relaxed text-stone-700 placeholder:text-stone-300 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none" />
                  </td>
                  <td className="border-b border-stone-200 px-2 py-2 text-right">
                    <button type="button" onClick={() => void run(row, onSave(row.uid, drafts[row.uid] ?? {}))} disabled={!dirty || state === "saving"} className="rounded-md bg-stone-900 px-2.5 py-1 text-xs font-medium text-white disabled:bg-stone-200 disabled:text-stone-400">{state === "saving" ? "…" : state === "done" ? "✓" : "保存"}</button>
                    {errors[row.uid] && <p className="mt-1 text-[10px] leading-tight text-rose-600">{errors[row.uid]}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
