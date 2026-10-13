"use client";
import Image from "next/image";
import { useMemo, useState } from "react";
import { TagPicker } from "@/components/admin/TagPicker";
import { CARD_BUTTON, CARD_INPUT, CARD_SELECT, CARD_TEXTAREA, CardField, CardToggle, MobileSaveBar } from "@/components/admin/MobileCard";
import { adminName } from "@/lib/names";
import { compareGuests } from "@/lib/roster";
import { ATTENDANCE_LABEL, ATTENDANCE_OPTIONS, CEREMONY_LABEL, PAYMENT_OPTIONS, type Attendance, type GuestRow, type PaymentStatus } from "@/types/admin";

type Draft = Partial<Pick<GuestRow, "nickname" | "tags" | "attendance" | "allergy" | "paymentStatus" | "aiMemo">>;
export type GuestPatch = Draft & { isApproved?: boolean; isActive?: boolean; ackAnswerChange?: boolean };
type SaveState = "idle" | "saving" | "done" | "error";

const ATTENDANCE_STYLE: Record<Attendance, string> = { unanswered: "bg-stone-100 text-stone-600", both: "bg-emerald-50 text-emerald-700", first_only: "bg-teal-50 text-teal-700", second_only: "bg-sky-50 text-sky-700", declined: "bg-rose-50 text-rose-700" };
const PAYMENT_STYLE: Record<PaymentStatus, string> = { none: "bg-stone-100 text-stone-600", remitted: "bg-amber-50 text-amber-700", confirmed: "bg-emerald-50 text-emerald-700" };
/** 表（PC）のセルに置く入力欄。枠はホバー・フォーカスのときだけ出す */
const CELL_INPUT = "w-full rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none";
const CELL_TEXTAREA = `${CELL_INPUT} resize-y text-xs leading-relaxed text-stone-700 placeholder:text-stone-300`;
/**
 * ゲストが登録後に出欠・アレルギーを変えた印（useAdminGuests の answerChange）。
 * 出欠の変更は座席と料理の数に関わるので、アレルギーより強い色で出す。
 */
function AnswerChangeBadge({ row, onAck, busy, card = false }: { row: GuestRow; onAck: () => void; busy: boolean; card?: boolean }) {
  const c = row.answerChange;
  if (!c) return null;
  const attendance = c.fields.includes("attendance");
  const when = c.at ? c.at.toDate().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className={`rounded-md px-2 py-1.5 leading-snug ${card ? "mt-2 text-xs" : "mb-1.5 text-[11px]"} ${attendance ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>
      <p className="font-semibold">
        {attendance ? "出欠の変更あり" : "アレルギーの変更あり"}
        {attendance && c.fields.includes("allergy") && "・アレルギーも"}
      </p>
      {attendance && c.attendanceBefore && (
        <p>{ATTENDANCE_LABEL[c.attendanceBefore]} → {ATTENDANCE_LABEL[row.attendance]}</p>
      )}
      {when && <p className="text-[10px] opacity-70">{when}</p>}
      <button type="button" disabled={busy} onClick={onAck} className={`mt-1 w-full bg-white/80 font-medium hover:bg-white disabled:opacity-50 ${card ? "min-h-11 touch-manipulation rounded-lg px-3 text-sm" : "rounded px-2 py-0.5 text-[10px]"}`}>確認済みにする</button>
    </div>
  );
}

function sameTags(a: string[], b: string[]) { return a.length === b.length && a.every((t, i) => t === b[i]); }

export function GuestTable({ mode, rows, preGuests = [], onSave, onApprove }: { mode: "pending" | "approved"; rows: GuestRow[]; preGuests?: GuestRow[]; onSave: (uid: string, patch: GuestPatch) => Promise<void>; onApprove?: (row: GuestRow, preUid: string) => Promise<void>; }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [linkTo, setLinkTo] = useState<Record<string, string>>({});
  /** スマホのカードで詳細を開いている行 */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  function saveAll() {
    void (async () => { for (const r of dirtyRows) await run(r, onSave(r.uid, drafts[r.uid] ?? {})); })();
  }
  const stateOf = (row: GuestRow) => states[row.uid] ?? "idle";

  // ---- 行の入力。表（PC）とカード（スマホ）で同じものを出す。card のときは 16px・44px にする ----
  function nicknameInput(row: GuestRow, card: boolean) {
    return <input value={field(row, "nickname")} onChange={(e) => patch(row.uid, { nickname: e.target.value })} maxLength={20} placeholder="未設定" aria-label="ニックネーム" className={card ? CARD_INPUT : `${CELL_INPUT} text-stone-800 placeholder:text-stone-300`} />;
  }
  function uidButton(row: GuestRow) {
    return <button type="button" title={row.uid} onClick={() => void navigator.clipboard?.writeText(row.uid)} className="font-mono text-[10px] text-stone-300 hover:text-stone-700">{row.uid.slice(0, 12)}…</button>;
  }
  function lineInfo(row: GuestRow) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-stone-200">{row.photoURL && <Image src={row.photoURL} alt="" fill sizes="32px" className="object-cover" />}</span>
        <span className="min-w-0 truncate text-xs text-stone-500" title={row.lineDisplayName}>{row.lineDisplayName || "—"}</span>
      </div>
    );
  }
  function linkSelect(row: GuestRow, card: boolean) {
    return <select value={linkTo[row.uid] ?? ""} onChange={(e) => setLinkTo((p) => ({ ...p, [row.uid]: e.target.value }))} aria-label="紐付ける名簿" className={card ? `${CARD_SELECT} w-full min-w-0 border border-stone-200 bg-white font-normal text-stone-700` : "w-full rounded-md border border-stone-200 bg-white px-2 py-1 text-xs"}><option value="">紐付けない（新規ゲスト）</option>{sortedPre.map((g) => <option key={g.uid} value={g.uid}>{adminName(g)}{g.kana ? `（${g.kana}）` : ""}</option>)}</select>;
  }
  function approveButton(row: GuestRow, card: boolean) {
    const saving = stateOf(row) === "saving";
    return <button type="button" disabled={saving || !onApprove} onClick={() => onApprove && void run(row, onApprove(row, linkTo[row.uid] ?? ""))} className={`bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 ${card ? `${CARD_BUTTON} shrink-0` : "w-full rounded-md px-3 py-1.5 text-xs font-medium"}`}>{saving ? "処理中…" : "承認する"}</button>;
  }
  function unapprove(row: GuestRow) { void run(row, onSave(row.uid, { isApproved: false })); }
  // ★停止はタグを空にし、リフレッシュトークンも失効させる★
  //   承認解除と違い、承認待ちキューにも戻らない
  function ban(row: GuestRow) { if (confirm(`${adminName(row)} のアクセスを停止します。よろしいですか？`)) void run(row, onSave(row.uid, { isActive: false })); }
  function attendanceSelect(row: GuestRow, card: boolean) {
    return <select value={field(row, "attendance")} onChange={(e) => patch(row.uid, { attendance: e.target.value as Attendance })} aria-label="出欠" className={`w-full ${card ? `${CARD_SELECT} min-w-0` : "rounded-md px-2 py-1 text-xs font-medium"} ${ATTENDANCE_STYLE[field(row, "attendance")]}`}>{ATTENDANCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  }
  function allergyTextarea(row: GuestRow, card: boolean) {
    return <textarea value={field(row, "allergy")} onChange={(e) => patch(row.uid, { allergy: e.target.value })} rows={2} maxLength={500} placeholder="—" aria-label="アレルギー" className={card ? CARD_TEXTAREA : CELL_TEXTAREA} />;
  }
  /** 備考はゲスト本人が書く欄。管理画面からは編集しない */
  function noteText(row: GuestRow, card: boolean) {
    return row.note ? <p className={`mt-1 whitespace-pre-wrap break-words leading-relaxed text-stone-500 ${card ? "text-xs" : "text-[10px]"}`}>備考: {row.note}</p> : null;
  }
  function paymentSelect(row: GuestRow, card: boolean) {
    return <select value={field(row, "paymentStatus")} onChange={(e) => patch(row.uid, { paymentStatus: e.target.value as PaymentStatus })} aria-label="送金" className={`w-full ${card ? `${CARD_SELECT} min-w-0` : "rounded-md px-2 py-1 text-xs font-medium"} ${PAYMENT_STYLE[field(row, "paymentStatus")]}`}>{PAYMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  }
  function tagPicker(row: GuestRow) {
    return <TagPicker value={field(row, "tags")} onChange={(next) => patch(row.uid, { tags: next })} />;
  }
  function aiMemoTextarea(row: GuestRow, card: boolean) {
    return <textarea value={field(row, "aiMemo")} onChange={(e) => patch(row.uid, { aiMemo: e.target.value })} rows={2} maxLength={2000} placeholder="席次の希望など" aria-label="AI用メモ" className={card ? CARD_TEXTAREA : CELL_TEXTAREA} />;
  }
  function saveButton(row: GuestRow, card: boolean) {
    const state = stateOf(row);
    return <button type="button" onClick={() => void run(row, onSave(row.uid, drafts[row.uid] ?? {}))} disabled={!isDirty(row) || state === "saving"} className={`bg-stone-900 text-white disabled:bg-stone-200 disabled:text-stone-400 ${card ? CARD_BUTTON : "rounded-md px-2.5 py-1 text-xs font-medium"}`}>{state === "saving" ? "…" : state === "done" ? "✓" : "保存"}</button>;
  }
  function ackBadge(row: GuestRow, card: boolean) {
    return <AnswerChangeBadge row={row} card={card} busy={stateOf(row) === "saving"} onAck={() => void run(row, onSave(row.uid, { ackAnswerChange: true }))} />;
  }

  if (rows.length === 0) return <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">{mode === "pending" ? "承認待ちのゲストはいません" : "承認済みのゲストはまだいません"}</p>;

  return (
    <div>
      {/* スマホ: 1人 = 1カード。1行目に名前と承認、2行目にタグ。出欠・アレルギーなどは「▾」で開く（Issue #127） */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => {
          const dirty = isDirty(row);
          const changed = row.answerChange !== null;
          const open = !!expanded[row.uid];
          const name = adminName(row) || "（名前なし）";
          const toggle = () => setExpanded((p) => ({ ...p, [row.uid]: !p[row.uid] }));
          return (
            <li key={row.uid} className={`rounded-xl border px-3 py-2 ${dirty ? "border-amber-200 bg-amber-50" : changed ? "border-rose-200 bg-rose-50" : mode === "pending" ? "border-sky-200 bg-sky-50/60" : "border-stone-200 bg-white"}`}>
              <div className="flex items-center gap-2">
                <button type="button" aria-expanded={open} onClick={toggle} className="flex min-h-11 min-w-0 flex-1 touch-manipulation flex-col justify-center text-left">
                  <span className="max-w-full break-words text-base font-medium leading-snug text-stone-900">{name}</span>
                  {row.kana && <span className="max-w-full truncate text-[11px] text-stone-400">{row.kana}</span>}
                </button>
                {/* ★カードの1行目に承認の解除を置かない★ 「▾」の隣にあり、押し間違えると承認が外れる。解除は詳細の中 */}
                {mode === "pending" ? approveButton(row, true) : <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">✓ 承認済</span>}
                <CardToggle open={open} onClick={toggle} label={name} />
              </div>
              <div className="pb-1">{tagPicker(row)}</div>
              {mode === "pending" && <div className="mt-1">{linkSelect(row, true)}</div>}
              {ackBadge(row, true)}
              {errors[row.uid] && <p role="alert" className="mt-1 text-xs text-rose-600">{errors[row.uid]}</p>}
              {open && (
                <div className="mt-2 space-y-2 border-t border-stone-200/70 pt-2">
                  <CardField label="ニックネーム">{nicknameInput(row, true)}</CardField>
                  <div>
                    <p className="mb-0.5 text-[11px] text-stone-500">LINE</p>
                    {lineInfo(row)}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <CardField label="出欠">{attendanceSelect(row, true)}</CardField>
                    <CardField label="送金">{paymentSelect(row, true)}</CardField>
                  </div>
                  {row.ceremony && <p className="text-xs text-stone-500">{CEREMONY_LABEL[row.ceremony]}</p>}
                  <div>
                    <CardField label="アレルギー">{allergyTextarea(row, true)}</CardField>
                    {noteText(row, true)}
                  </div>
                  <CardField label="AI用メモ">{aiMemoTextarea(row, true)}</CardField>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="mr-auto">{uidButton(row)}</span>
                    {mode === "approved" && (
                      <>
                        <button type="button" onClick={() => unapprove(row)} className={`${CARD_BUTTON} border border-stone-200 bg-white text-stone-600`}>承認を解除</button>
                        <button type="button" onClick={() => ban(row)} className={`${CARD_BUTTON} border border-rose-200 bg-white text-rose-600`}>アクセス停止</button>
                      </>
                    )}
                    {saveButton(row, true)}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <MobileSaveBar count={dirtyRows.length} onSave={saveAll} />

      {dirtyRows.length > 0 && <div className="mb-2 hidden justify-end md:flex"><button type="button" onClick={saveAll} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white">まとめて保存 ({dirtyRows.length})</button></div>}
      <div className="hidden overflow-x-auto rounded-xl border border-stone-200 bg-white md:block">
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
              const dirty = isDirty(row);
              const changed = row.answerChange !== null;
              const bg = dirty ? "bg-amber-50" : changed ? "bg-rose-50" : mode === "pending" ? "bg-sky-50/60" : "bg-white";
              return (
                <tr key={row.uid} className={`align-top ${dirty ? "bg-amber-50/60" : changed ? "bg-rose-50/50" : mode === "pending" ? "bg-sky-50/40" : "hover:bg-stone-50/60"}`}>
                  <td className={`sticky left-0 z-10 border-b border-r border-stone-200 px-3 py-2 ${bg}`}>
                    <p className="truncate font-medium text-stone-900" title={adminName(row)}>{adminName(row)}</p>
                    {row.kana && <p className="truncate text-[10px] text-stone-400">{row.kana}</p>}
                    {uidButton(row)}
                  </td>
                  <td className="border-b border-stone-200 px-2 py-2">{nicknameInput(row, false)}</td>
                  <td className="border-b border-stone-200 px-3 py-2">{lineInfo(row)}</td>
                  <td className="border-b border-stone-200 px-2 py-2">
                    {mode === "pending" ? (
                      <div className="space-y-1.5">
                        {linkSelect(row, false)}
                        {approveButton(row, false)}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <button type="button" onClick={() => unapprove(row)} className="w-full rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">✓ 承認済</button>
                        <button type="button" onClick={() => ban(row)} className="w-full rounded-full border border-rose-200 px-2.5 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50">アクセス停止</button>
                      </div>
                    )}
                  </td>
                  <td className="border-b border-stone-200 px-2 py-2">
                    {ackBadge(row, false)}
                    {attendanceSelect(row, false)}
                    {row.ceremony && <p className="mt-1 text-[10px] text-stone-500">{CEREMONY_LABEL[row.ceremony]}</p>}
                  </td>
                  <td className="border-b border-stone-200 px-2 py-2">
                    {allergyTextarea(row, false)}
                    {noteText(row, false)}
                  </td>
                  <td className="border-b border-stone-200 px-2 py-2">{paymentSelect(row, false)}</td>
                  <td className="border-b border-stone-200 px-2 py-2">{tagPicker(row)}</td>
                  <td className="border-b border-stone-200 px-2 py-2">{aiMemoTextarea(row, false)}</td>
                  <td className="border-b border-stone-200 px-2 py-2 text-right">
                    {saveButton(row, false)}
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
