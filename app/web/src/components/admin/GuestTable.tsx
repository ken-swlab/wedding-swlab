"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { TAG_DEFS, tagDef } from "@/config/tags";
import {
  ATTENDANCE_OPTIONS, ATTENDANCE_LABEL, PAYMENT_OPTIONS, PAYMENT_LABEL,
  type Attendance, type GuestRow, type PaymentStatus,
} from "@/types/admin";

type Draft = Partial<Pick<GuestRow,
  "nickname" | "tags" | "attendance" | "allergy" | "paymentStatus" | "aiMemo">>;
type Patch = Draft & { isApproved?: boolean };
type SaveState = "idle" | "saving" | "done" | "error";
type Filter = "all" | "pending" | "attending" | "payment";

const ATTENDANCE_STYLE: Record<Attendance, string> = {
  unanswered: "bg-stone-100 text-stone-600",
  attending:  "bg-emerald-50 text-emerald-700",
  declined:   "bg-rose-50 text-rose-700",
};

const PAYMENT_STYLE: Record<PaymentStatus, string> = {
  none:      "bg-stone-100 text-stone-600",
  remitted:  "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-50 text-emerald-700",
};

function sameTags(a: string[], b: string[]) {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

export function GuestTable({
  rows,
  onSave,
}: {
  rows: GuestRow[];
  onSave: (uid: string, patch: Patch) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  function field<K extends keyof Draft>(row: GuestRow, key: K): NonNullable<Draft[K]> {
    const d = drafts[row.uid]?.[key];
    return (d !== undefined ? d : row[key]) as NonNullable<Draft[K]>;
  }

  function patch(uid: string, p: Draft) {
    setDrafts((prev) => ({ ...prev, [uid]: { ...prev[uid], ...p } }));
    setStates((prev) => ({ ...prev, [uid]: "idle" }));
  }

  function isDirty(row: GuestRow): boolean {
    const d = drafts[row.uid];
    if (!d) return false;
    if (d.tags !== undefined && !sameTags(d.tags, row.tags)) return true;
    return (["nickname", "attendance", "allergy", "paymentStatus", "aiMemo"] as const)
      .some((k) => d[k] !== undefined && d[k] !== row[k]);
  }

  async function commit(row: GuestRow, extra?: Patch) {
    const d = { ...(drafts[row.uid] ?? {}), ...(extra ?? {}) };
    if (Object.keys(d).length === 0) return;

    setStates((p) => ({ ...p, [row.uid]: "saving" }));
    setErrors((p) => ({ ...p, [row.uid]: "" }));
    try {
      await onSave(row.uid, d);
      setDrafts((p) => {
        const next = { ...p };
        delete next[row.uid];
        return next;
      });
      setStates((p) => ({ ...p, [row.uid]: "done" }));
    } catch (e) {
      setStates((p) => ({ ...p, [row.uid]: "error" }));
      setErrors((p) => ({ ...p, [row.uid]: e instanceof Error ? e.message : "保存に失敗" }));
    }
  }

  const pendingCount = rows.filter((r) => r.isRegistered && !r.isApproved).length;
  const remittedCount = rows.filter((r) => r.paymentStatus === "remitted").length;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (filter === "pending") return r.isRegistered && !r.isApproved;
        if (filter === "attending") return r.attendance === "attending";
        if (filter === "payment") return r.paymentStatus === "remitted";
        return true;
      })
      .filter((r) =>
        !needle ||
        [r.nickname, r.displayName, r.uid, ...r.tags].join(" ").toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        // 未承認を先頭に寄せる
        const ap = a.isRegistered && !a.isApproved ? 0 : 1;
        const bp = b.isRegistered && !b.isApproved ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (a.nickname || a.displayName).localeCompare(b.nickname || b.displayName, "ja");
      });
  }, [rows, q, filter]);

  const dirtyRows = visible.filter(isDirty);

  function exportCsv() {
    const head = ["uid", "ニックネーム", "LINE名", "承認", "出欠", "アレルギー", "送金", "タグ", "メモ"];
    const body = visible.map((r) => [
      r.uid, field(r, "nickname"), r.displayName, r.isApproved ? "済" : "未",
      ATTENDANCE_LABEL[field(r, "attendance")], field(r, "allergy"),
      PAYMENT_LABEL[field(r, "paymentStatus")], field(r, "tags").join(" "), field(r, "aiMemo"),
    ]);
    const csv = [head, ...body]
      .map((c) => c.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    // ★BOM を付けないと Excel で日本語が文字化けする★
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `guests_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const FILTERS: { key: Filter; label: string; badge?: number }[] = [
    { key: "all", label: "すべて" },
    { key: "pending", label: "未承認", badge: pendingCount },
    { key: "attending", label: "出席" },
    { key: "payment", label: "送金報告済", badge: remittedCount },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                filter === f.key ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-100"
              }`}
            >
              {f.label}
              {f.badge ? (
                <span className={`ml-1.5 rounded-full px-1.5 text-xs tabular-nums ${
                  filter === f.key ? "bg-white/20" : "bg-amber-100 text-amber-800"
                }`}>{f.badge}</span>
              ) : null}
            </button>
          ))}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前 / UID / タグ で検索"
          className="min-w-[180px] flex-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-stone-400"
        />
        <button type="button" onClick={exportCsv}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50">
          CSV
        </button>
        <button
          type="button"
          disabled={dirtyRows.length === 0}
          onClick={() => { void (async () => { for (const r of dirtyRows) await commit(r); })(); }}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          まとめて保存{dirtyRows.length > 0 ? ` (${dirtyRows.length})` : ""}
        </button>
        <span className="ml-auto text-xs text-stone-400">{visible.length} 名</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[1240px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-stone-50">
            <tr className="text-left text-xs font-semibold text-stone-500">
              <th className="sticky left-0 z-20 w-52 border-b border-r border-stone-200 bg-stone-50 px-3 py-2">ゲスト</th>
              <th className="w-24 border-b border-stone-200 px-3 py-2">承認</th>
              <th className="w-24 border-b border-stone-200 px-3 py-2">出欠</th>
              <th className="w-48 border-b border-stone-200 px-3 py-2">アレルギー</th>
              <th className="w-32 border-b border-stone-200 px-3 py-2">送金</th>
              <th className="w-64 border-b border-stone-200 px-3 py-2">タグ</th>
              <th className="min-w-[200px] border-b border-stone-200 px-3 py-2">AI用メモ</th>
              <th className="w-20 border-b border-stone-200 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const dirty = isDirty(row);
              const pending = row.isRegistered && !row.isApproved;
              const state = states[row.uid] ?? "idle";
              const tags = field(row, "tags");
              const addable = TAG_DEFS.filter((t) => !tags.includes(t.id));
              const bg = dirty ? "bg-amber-50" : pending ? "bg-sky-50/50" : "bg-white";

              return (
                <tr key={row.uid} className={`align-top ${dirty ? "bg-amber-50/60" : pending ? "bg-sky-50/40" : "hover:bg-stone-50/60"}`}>
                  <td className={`sticky left-0 z-10 border-b border-r border-stone-200 px-3 py-2 ${bg}`}>
                    <div className="flex items-center gap-2">
                      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-stone-200">
                        {row.photoURL && <Image src={row.photoURL} alt="" fill sizes="32px" className="object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <input
                          value={field(row, "nickname")}
                          onChange={(e) => patch(row.uid, { nickname: e.target.value })}
                          maxLength={20}
                          placeholder={row.displayName}
                          className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 font-medium text-stone-800 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          title={row.uid}
                          onClick={() => void navigator.clipboard?.writeText(row.uid)}
                          className="px-1.5 font-mono text-[10px] text-stone-400 hover:text-stone-700"
                        >
                          {row.uid.slice(0, 12)}…
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* 承認: 下書きを挟まず即座に反映する */}
                  <td className="border-b border-stone-200 px-3 py-3">
                    {row.isApproved ? (
                      <button
                        type="button"
                        onClick={() => void commit(row, { isApproved: false })}
                        className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        ✓ 承認済
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={state === "saving"}
                        onClick={() => void commit(row, { isApproved: true })}
                        className="rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        承認する
                      </button>
                    )}
                    {!row.isRegistered && (
                      <span className="mt-1 block text-[10px] text-stone-400">未登録</span>
                    )}
                  </td>

                  <td className="border-b border-stone-200 px-3 py-2">
                    <select
                      value={field(row, "attendance")}
                      onChange={(e) => patch(row.uid, { attendance: e.target.value as Attendance })}
                      className={`w-full rounded-md px-2 py-1 text-xs font-medium ${ATTENDANCE_STYLE[field(row, "attendance")]}`}
                    >
                      {ATTENDANCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>

                  <td className="border-b border-stone-200 px-3 py-2">
                    <textarea
                      value={field(row, "allergy")}
                      onChange={(e) => patch(row.uid, { allergy: e.target.value })}
                      rows={2}
                      maxLength={500}
                      placeholder="—"
                      className="w-full resize-y rounded border border-transparent bg-transparent px-1.5 py-1 text-xs leading-relaxed text-stone-700 placeholder:text-stone-300 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none"
                    />
                  </td>

                  <td className="border-b border-stone-200 px-3 py-2">
                    <select
                      value={field(row, "paymentStatus")}
                      onChange={(e) => patch(row.uid, { paymentStatus: e.target.value as PaymentStatus })}
                      className={`w-full rounded-md px-2 py-1 text-xs font-medium ${PAYMENT_STYLE[field(row, "paymentStatus")]}`}
                    >
                      {PAYMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>

                  <td className="border-b border-stone-200 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {tags.map((t) => (
                        <span key={t} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tagDef(t).className}`}>
                          {tagDef(t).label}
                          <button type="button" aria-label={`${tagDef(t).label} を外す`}
                            onClick={() => patch(row.uid, { tags: tags.filter((x) => x !== t) })}
                            className="opacity-50 hover:opacity-100">×</button>
                        </span>
                      ))}
                      {addable.length > 0 && (
                        <select value="" onChange={(e) => { if (e.target.value) patch(row.uid, { tags: [...tags, e.target.value] }); }}
                          className="rounded-full border border-dashed border-stone-300 bg-white px-1.5 py-0.5 text-[11px] text-stone-400">
                          <option value="">＋</option>
                          {addable.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                      )}
                    </div>
                  </td>

                  <td className="border-b border-stone-200 px-3 py-2">
                    <textarea
                      value={field(row, "aiMemo")}
                      onChange={(e) => patch(row.uid, { aiMemo: e.target.value })}
                      rows={2}
                      maxLength={2000}
                      placeholder="席次の希望、CTFのヒント難易度など"
                      className="w-full resize-y rounded border border-transparent bg-transparent px-1.5 py-1 text-xs leading-relaxed text-stone-700 placeholder:text-stone-300 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none"
                    />
                  </td>

                  <td className="border-b border-stone-200 px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void commit(row)}
                      disabled={!dirty || state === "saving"}
                      className="rounded-md bg-stone-900 px-2.5 py-1 text-xs font-medium text-white disabled:bg-stone-200 disabled:text-stone-400"
                    >
                      {state === "saving" ? "…" : state === "done" ? "✓" : "保存"}
                    </button>
                    {errors[row.uid] && (
                      <p className="mt-1 text-[10px] leading-tight text-rose-600">{errors[row.uid]}</p>
                    )}
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
