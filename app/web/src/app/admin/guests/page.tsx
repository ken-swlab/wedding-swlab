"use client";
import { postJson } from "@/lib/api-client";
import { TagPicker } from "@/components/admin/TagPicker";
import { givenName } from "@/config/persona";
import { useTags } from "@/lib/tags-client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useAdminGuests } from "@/hooks/useAdminGuests";
import { compareGuests } from "@/lib/roster";
import { adminName } from "@/lib/names";
import { INVITATION_STATUSES, NEW_GUEST_NAME, invitationDef } from "@/config/roster";
import { TruncatedWarning } from "@/components/admin/TruncatedWarning";
import { RosterImportDialog } from "@/components/admin/RosterImportDialog";
import { CARD_BUTTON, CARD_INPUT, CARD_SELECT, CardField, CardToggle, MobileSaveBar } from "@/components/admin/MobileCard";
import type { GuestRow } from "@/types/admin";

type Draft = Partial<Pick<GuestRow, "displayName" | "kana" | "invitationStatus">>;

/** 表（PC）のセルに置く入力欄。枠はホバー・フォーカスのときだけ出す */
const CELL_INPUT = "w-full rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none";

async function callRoster(payload: Record<string, unknown>) {
  return postJson("/api/admin/roster", payload);
}

export default function AdminRosterPage() {
  const { user, isAdmin, loading: authLoading } = useGuestSession();
  const { rows, truncated, loading, error } = useAdminGuests(isAdmin);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [tagFilter, setTagFilter] = useState<string>("");
  const [registered, setRegistered] = useState<"" | "yes" | "no">("");
  /**
   * 行の種類で絞り込む（Issue #203）。roster … 名簿の行（仮ゲスト）、self … LINE でログインした本人の行。
   * ★このリストには本人の行も並ぶ★ 本人が回答すると本名が入り「登録済」になるので、名簿の行と見分けにくい。
   *   承認待ちの「紐付けて承認」の候補に出るのは名簿の行だけ。
   */
  const [kind, setKind] = useState<"" | "roster" | "self">("");
  /** 「＋ 個別追加」で作った行。一覧に届いたら名前の入力欄にフォーカスする（Issue #203） */
  const focusUid = useRef<string | null>(null);
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState(false);
  const [merging, setMerging] = useState<GuestRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { allTags } = useTags();
  /** タグは即時保存する。反映が届くまでのあいだ画面が巻き戻らないよう手元の値を優先する */
  const [tagOverride, setTagOverride] = useState<Record<string, string[]>>({});
  const [tagSaving, setTagSaving] = useState<Record<string, boolean>>({});
  /** 呼び名も即時保存。打鍵ごとに投げないよう onBlur で確定させる */
  const [callOverride, setCallOverride] = useState<Record<string, string>>({});
  /** スマホのカードで詳細を開いている行 */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  /** 下書きを保存する。保存できた（下書きが無かった）ら true */
  const save = useCallback(async (row: GuestRow): Promise<boolean> => {
    const d = drafts[row.uid];
    if (!d) return true;
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
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : "保存に失敗しました");
      return false;
    } finally {
      setSaving((s) => ({ ...s, [row.uid]: false }));
    }
  }, [drafts]);

  const rowsWithTags = useMemo(
    () => rows.map((r) => (tagOverride[r.uid] ? { ...r, tags: tagOverride[r.uid] } : r)),
    [rows, tagOverride],
  );

  /**
   * ★タグだけは /api/admin/roster ではなく /api/admin/update-guest を通す★
   *   Custom Claims への反映（applyGuestTags）がそちらにあるため、
   *   ここで別実装を作るとタグと権限が二重管理になる。
   *   名前やふりがなと違って離散的な操作なので、即時保存する。
   */
  const saveTags = useCallback(async (row: GuestRow, next: string[]) => {
    const before = tagOverride[row.uid] ?? row.tags;
    setTagOverride((p) => ({ ...p, [row.uid]: next }));
    setTagSaving((p) => ({ ...p, [row.uid]: true }));
    try {
      await postJson("/api/admin/update-guest", { uid: row.uid, tags: next });
    } catch (e) {
      setTagOverride((p) => ({ ...p, [row.uid]: before }));
      setToast(e instanceof Error ? e.message : "タグの保存に失敗しました");
    } finally {
      setTagSaving((p) => ({ ...p, [row.uid]: false }));
    }
  }, [tagOverride]);

  /**
   * 呼び名の保存。roster API は guestAdmin を扱わないので
   * タグと同じく update-guest を通す（Custom Claims 側は触らない）。
   */
  const saveCallName = useCallback(
    async (row: GuestRow, field: "callNameGroom" | "callNameBride", value: string) => {
      const key = `${row.uid}:${field}`;
      const before = row[field] ?? "";
      if (value.trim() === before.trim()) {
        setCallOverride((p) => {
          const n = { ...p };
          delete n[key];
          return n;
        });
        return;
      }
      try {
        await postJson("/api/admin/update-guest", { uid: row.uid, [field]: value.trim() });
      } catch (e) {
        setCallOverride((p) => ({ ...p, [key]: before }));
        setToast(e instanceof Error ? e.message : "呼び名の保存に失敗しました");
      }
    },
    [],
  );

  const stats = useMemo(() => {
    const by: Record<string, number> = {};
    let reg = 0;
    for (const r of rowsWithTags) {
      for (const t of r.tags) by[t] = (by[t] ?? 0) + 1;
      if (r.isRegistered) reg += 1;
    }
    return { by, reg, total: rowsWithTags.length };
  }, [rowsWithTags]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rowsWithTags
      .filter((r) => !tagFilter || r.tags.includes(tagFilter))
      .filter((r) => registered === "" ? true : registered === "yes" ? r.isRegistered : !r.isRegistered)
      .filter((r) => kind === "" ? true : kind === "roster" ? r.isPreRegistered : !r.isPreRegistered)
      .filter((r) => !needle || `${r.displayName} ${r.kana} ${r.nickname} ${r.realName}`.toLowerCase().includes(needle))
      .sort(compareGuests);
  }, [rowsWithTags, tagFilter, registered, kind, q]);

  const dirtyRows = visible.filter(isDirty);
  const loggedIn = useMemo(() => rows.filter((r) => !r.isPreRegistered), [rows]);

  function saveAll() {
    void (async () => { for (const r of dirtyRows) await save(r); setToast("保存しました"); })();
  }
  /**
   * ★追加した行は、すぐ名前を入れられるようにする★（Issue #203）「新しいゲスト」のまま保存し忘れると、
   *   紐付けの候補で見分けられない。絞り込みを外して行を見せ、スマホではカードを開き、名前の入力欄にフォーカスする。
   */
  function addOne() {
    void callRoster({ action: "upsert", displayName: NEW_GUEST_NAME })
      .then((r) => {
        setToast("1名追加しました。名前を入れて保存してください");
        setQ(""); setTagFilter(""); setRegistered(""); setKind("");
        const uid = r.uid;
        if (typeof uid === "string") {
          setExpanded((p) => ({ ...p, [uid]: true }));
          focusUid.current = uid;
        }
      })
      .catch((e) => setToast(e.message));
  }
  // 追加した行が購読で届いたら、見えているほう（スマホのカード・PC の表）の名前の欄にフォーカスする
  useEffect(() => {
    const uid = focusUid.current;
    if (!uid || !visible.some((r) => r.uid === uid)) return;
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-name-input="${uid}"]`));
    const el = inputs.find((i) => i.offsetParent !== null);
    if (!el) return;
    focusUid.current = null;
    el.focus();
    el.select();
    el.scrollIntoView({ block: "center" });
  }, [visible, expanded]);

  /** 統合の前に下書きを保存する（Issue #203）。保存した名前で「本人と統合」を開く */
  async function startMerge(row: GuestRow, dirty: boolean) {
    if (dirty) {
      const name = field(row, "displayName");
      if (!(await save(row))) return;
      setMerging({ ...row, displayName: name });
    } else setMerging(row);
  }

  // ---- 行の入力。表（PC）とカード（スマホ）で同じものを出す。card のときは 16px・44px にする ----
  function nameInput(row: GuestRow, card: boolean) {
    return <input value={field(row, "displayName")} onChange={(e) => patch(row.uid, { displayName: e.target.value })} maxLength={40} aria-label="名前" data-name-input={row.uid} className={card ? CARD_INPUT : `${CELL_INPUT} font-medium text-stone-800`} />;
  }
  function kanaInput(row: GuestRow, card: boolean) {
    return <input value={field(row, "kana")} onChange={(e) => patch(row.uid, { kana: e.target.value })} maxLength={40} placeholder="まえかわ たろう" aria-label="ふりがな" className={card ? CARD_INPUT : `${CELL_INPUT} text-xs text-stone-600 placeholder:text-stone-300`} />;
  }
  function statusSelect(row: GuestRow, card: boolean) {
    return (
      <select value={field(row, "invitationStatus")} onChange={(e) => patch(row.uid, { invitationStatus: e.target.value })} aria-label="招待状況" className={`${card ? `${CARD_SELECT} shrink-0` : "w-full rounded-md px-2 py-1 text-xs font-medium"} ${invitationDef(field(row, "invitationStatus")).className}`}>
        {INVITATION_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    );
  }
  function tagPicker(row: GuestRow) {
    return <TagPicker value={row.tags} onChange={(next) => void saveTags(row, next)} disabled={!!tagSaving[row.uid]} />;
  }
  function callNameInput(row: GuestRow, name: "callNameGroom" | "callNameBride", card: boolean) {
    const key = `${row.uid}:${name}`;
    return (
      <input
        value={callOverride[key] ?? row[name] ?? ""}
        onChange={(e) => setCallOverride((p) => ({ ...p, [key]: e.target.value }))}
        onBlur={(e) => void saveCallName(row, name, e.target.value)}
        maxLength={20}
        placeholder={givenName(row.displayName) || "—"}
        aria-label={name === "callNameGroom" ? "新郎からの呼び名" : "新婦からの呼び名"}
        className={card ? CARD_INPUT : `${CELL_INPUT} text-xs text-gray-900 placeholder:text-gray-300`}
      />
    );
  }
  /** 行の種類（Issue #203）。名簿の行か、LINE でログインした本人の行か */
  function kindBadge(row: GuestRow) {
    return row.isPreRegistered
      ? <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600" title="招待予定者リストで追加した行。本人と紐付ける前">名簿</span>
      : <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700" title="LINE でログインした本人の行。名簿の行ではないので、紐付けの候補には出ません">本人（LINE）</span>;
  }
  /** 保存していない下書きがある行の印（Issue #203） */
  function unsavedBadge(dirty: boolean) {
    return dirty ? <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900">未保存</span> : null;
  }
  function registeredBadge(row: GuestRow) {
    return row.isRegistered ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">登録済</span> : <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">未登録</span>;
  }
  function rowActions(row: GuestRow, dirty: boolean, card: boolean) {
    return (
      <div className="flex justify-end gap-1">
        {dirty && <button type="button" onClick={() => void save(row)} disabled={saving[row.uid]} className={`bg-stone-900 text-white disabled:opacity-50 ${card ? CARD_BUTTON : "rounded-md px-2.5 py-1 text-xs font-medium"}`}>{saving[row.uid] ? "…" : "保存"}</button>}
        {/* ★統合は下書きがあっても押せる★ 押したら先に保存してから選ぶ（Issue #203） */}
        {row.isPreRegistered && (
          <>
            <button type="button" onClick={() => void startMerge(row, dirty)} disabled={saving[row.uid]} className={`border border-stone-200 text-stone-500 hover:bg-stone-50 ${card ? CARD_BUTTON : "rounded-md px-2 py-1 text-xs"}`}>統合</button>
            <button type="button" disabled={dirty} onClick={() => void callRoster({ action: "delete", uid: row.uid }).then(() => setToast("削除しました")).catch((e) => setToast(e.message))} className={`border border-stone-200 text-stone-400 hover:bg-rose-50 hover:text-rose-600 ${card ? CARD_BUTTON : "rounded-md px-2 py-1 text-xs"}`}>削除</button>
          </>
        )}
      </div>
    );
  }

  if (authLoading) return <main className="min-h-screen bg-stone-50 p-8"><div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" /></main>;
  if (!user || !isAdmin) return <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8"><p className="text-sm text-stone-600">管理者専用ページです</p></main>;

  return (
    <main className="selectable min-h-screen bg-stone-50">
      <div className="mx-auto max-w-6xl px-4 py-4 md:py-8">
        <header className="mb-3 md:mb-5">
          <Link href="/admin" className="-my-3 inline-block py-3 text-xs text-stone-400 hover:text-stone-700">← ゲスト管理に戻る</Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-serif text-xl text-stone-900">招待予定者リスト</h1>
              <p className="mt-1 text-xs text-stone-500 md:text-sm">本人がログインする前でも、顔やエピソードの紐付け先として使えます。タグは即時保存され、権限として効き始めるのは本登録・承認の時点です。</p>
              <p className="mt-1 text-xs text-stone-500 md:text-sm">LINE でログインした本人の行（<span className="font-medium text-sky-700">本人（LINE）</span>）もここに並びます。承認待ちの「紐付けて承認」の候補に出るのは、<span className="font-medium text-stone-700">名簿</span>の行だけです。</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center"><p className="tabular-nums text-lg font-semibold text-stone-900">{stats.total}</p><p className="text-[11px] text-stone-400">総数</p></div>
              <div className="text-center"><p className="tabular-nums text-lg font-semibold text-emerald-700">{stats.reg}</p><p className="text-[11px] text-stone-400">登録済</p></div>
              <div className="text-center"><p className="tabular-nums text-lg font-semibold text-stone-400">{stats.total - stats.reg}</p><p className="text-[11px] text-stone-400">未登録</p></div>
            </div>
          </div>
        </header>

        {/* スマホ: 2段に収める（1段目 = 検索と追加、2段目 = 絞り込み）。「まとめて保存」は一覧の下に貼り付ける */}
        <div className="mb-3 space-y-2 md:hidden">
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・ふりがな" aria-label="名前・ふりがなで検索" className={`${CARD_INPUT} min-w-0 flex-1`} />
            <button type="button" onClick={() => setImporting(true)} className="min-h-11 shrink-0 touch-manipulation rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-600">一括追加</button>
            <button type="button" onClick={addOne} className="min-h-11 shrink-0 touch-manipulation rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-600">＋ 個別追加</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="タグで絞り込む" className="min-h-11 min-w-0 rounded-lg border border-stone-200 bg-white px-2 text-base text-stone-700">
              <option value="">タグ: すべて</option>
              {allTags.filter((t) => t.community).map((t) => <option key={t.id} value={t.id}>{t.label}（{stats.by[t.id] ?? 0}）</option>)}
            </select>
            <select value={registered} onChange={(e) => setRegistered(e.target.value as "" | "yes" | "no")} aria-label="登録の状態で絞り込む" className="min-h-11 min-w-0 rounded-lg border border-stone-200 bg-white px-2 text-base text-stone-700">
              <option value="">登録: すべて</option><option value="yes">登録済のみ</option><option value="no">未登録のみ</option>
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value as "" | "roster" | "self")} aria-label="行の種類で絞り込む" className="min-h-11 min-w-0 rounded-lg border border-stone-200 bg-white px-2 text-base text-stone-700">
              <option value="">種類: すべて</option><option value="roster">名簿のみ</option><option value="self">本人のみ</option>
            </select>
          </div>
        </div>

        <div className="mb-3 hidden flex-wrap items-center gap-2 md:flex">
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => setTagFilter("")}
              className={`rounded-full px-3 py-1.5 text-sm ${!tagFilter ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-100"}`}>
              すべて
            </button>
            {allTags.filter((t) => t.community).map((t) => (
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
          <select value={kind} onChange={(e) => setKind(e.target.value as "" | "roster" | "self")} aria-label="行の種類で絞り込む" className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm">
            <option value="">種類: すべて</option><option value="roster">名簿のみ</option><option value="self">本人のみ</option>
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・ふりがなで検索" className="min-w-[160px] flex-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-stone-400" />
          <button type="button" onClick={() => setImporting(true)} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">一括追加</button>
          <button type="button" onClick={addOne} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">＋ 個別追加</button>
          <button type="button" disabled={dirtyRows.length === 0} onClick={saveAll} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">まとめて保存{dirtyRows.length > 0 ? ` (${dirtyRows.length})` : ""}</button>
        </div>

        {truncated && <TruncatedWarning />}
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">読み込みに失敗しました（{error.code}）</div>
        ) : loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-stone-200/60" />
        ) : visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-12 text-center text-sm text-stone-400">該当するゲストがいません。「一括追加」から名簿を投入してください。</p>
        ) : (
          <>
            {/* スマホ: 1人 = 1カード。1行目に名前と招待状況、2行目にタグ。ふりがな・呼び名は「▾」で開く（Issue #127） */}
            <ul className="space-y-2 md:hidden">
              {visible.map((row) => {
                const dirty = isDirty(row);
                const open = !!expanded[row.uid];
                // 名簿の名前が空（名簿に無いまま本人が登録した行）は、本人が入れた名前か LINE 名で見分ける
                const name = field(row, "displayName") || adminName(row);
                const toggle = () => setExpanded((p) => ({ ...p, [row.uid]: !p[row.uid] }));
                return (
                  <li key={row.uid} className={`rounded-xl border px-3 py-2 ${dirty ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"}`}>
                    <div className="flex items-center gap-2">
                      <button type="button" aria-expanded={open} onClick={toggle} className="flex min-h-11 min-w-0 flex-1 touch-manipulation flex-col items-start justify-center gap-0.5 text-left">
                        <span className="min-w-0 break-words text-base font-medium leading-snug text-stone-900">{name}</span>
                        {/* 行の種類と未保存の印は名前の下に（1行目に並べると、幅 375px で招待状況が押し出される） */}
                        <span className="flex gap-1">{kindBadge(row)}{unsavedBadge(dirty)}</span>
                      </button>
                      {statusSelect(row, true)}
                      <CardToggle open={open} onClick={toggle} label={name} />
                    </div>
                    <div className="pb-1">{tagPicker(row)}</div>
                    {open && (
                      <div className="mt-2 space-y-2 border-t border-stone-200/70 pt-2">
                        <CardField label="名前">{nameInput(row, true)}</CardField>
                        <CardField label="ふりがな">{kanaInput(row, true)}</CardField>
                        <div className="grid grid-cols-2 gap-2">
                          <CardField label="新郎からの呼び名">{callNameInput(row, "callNameGroom", true)}</CardField>
                          <CardField label="新婦からの呼び名">{callNameInput(row, "callNameBride", true)}</CardField>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          {registeredBadge(row)}
                          {rowActions(row, dirty, true)}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <MobileSaveBar count={dirtyRows.length} onSave={saveAll} />

            <div className="hidden overflow-x-auto rounded-xl border border-stone-200 bg-white md:block">
              <table className="w-full min-w-[1400px] border-collapse text-sm">
                <thead className="bg-stone-50 text-left text-xs font-semibold text-stone-500">
                  <tr><th className="border-b border-stone-200 px-3 py-2">名前</th><th className="w-44 border-b border-stone-200 px-3 py-2">ふりがな</th><th className="w-28 border-b border-stone-200 px-3 py-2">招待</th><th className="w-64 border-b border-stone-200 px-3 py-2">タグ</th><th className="w-32 border-b border-stone-200 px-3 py-2" title="新郎のAIがこのゲストを呼ぶときの名前">新郎からの呼び名</th><th className="w-32 border-b border-stone-200 px-3 py-2" title="新婦のAIがこのゲストを呼ぶときの名前">新婦からの呼び名</th><th className="w-28 border-b border-stone-200 px-3 py-2">状態</th><th className="w-32 border-b border-stone-200 px-3 py-2"></th></tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const dirty = isDirty(row);
                    return (
                      <tr key={row.uid} className={dirty ? "bg-amber-50/60" : "hover:bg-stone-50/60"}>
                        <td className="border-b border-stone-200 px-2 py-1.5">
                          {nameInput(row, false)}
                          <div className="mt-0.5 flex gap-1 px-1.5">{kindBadge(row)}{unsavedBadge(dirty)}</div>
                        </td>
                        <td className="border-b border-stone-200 px-2 py-1.5">{kanaInput(row, false)}</td>
                        <td className="border-b border-stone-200 px-2 py-1.5">{statusSelect(row, false)}</td>
                        <td className="border-b border-stone-200 px-2 py-1.5">{tagPicker(row)}</td>
                        <td className="border-b border-stone-200 px-2 py-1.5">{callNameInput(row, "callNameGroom", false)}</td>
                        <td className="border-b border-stone-200 px-2 py-1.5">{callNameInput(row, "callNameBride", false)}</td>
                        <td className="border-b border-stone-200 px-3 py-2">{registeredBadge(row)}</td>
                        <td className="border-b border-stone-200 px-2 py-2 text-right">{rowActions(row, dirty, false)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
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
      {toast && <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-[60] max-w-[calc(100vw-2rem)] md:bottom-6 -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-sm text-white shadow-lg">{toast}</div>}
    </main>
  );
}
