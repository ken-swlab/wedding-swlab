"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { postJson } from "@/lib/api-client";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useAdminGuests } from "@/hooks/useAdminGuests";
import { GuestTable, type GuestPatch } from "@/components/admin/GuestTable";
import { TruncatedWarning } from "@/components/admin/TruncatedWarning";
import { HiddenPosts } from "@/components/admin/HiddenPosts";
import { LineNotifyRetry } from "@/components/admin/LineNotifyRetry";
import { adminName } from "@/lib/names";
import { compareGuests } from "@/lib/roster";
import { tagDef, withoutSystemTags } from "@/config/tags";
import {
  ATTENDANCE_LABEL,
  ATTENDANCE_OPTIONS,
  CEREMONY_LABEL,
  FAMILY_ATTENDANCE_LABEL,
  FAMILY_ATTENDANCE_OPTIONS,
  PAYMENT_LABEL,
  type Attendance,
  type GuestRow,
  type InvitationKind,
} from "@/types/admin";
import { SpaceSwitch } from "@/components/guestbook/SpaceSwitch";
import { DRINK_LEVELS } from "@/config/drink";

/** スマホではタップ領域を 44px にする */
/** 親族・友人の絞り込み（Issue #240。guestPrivate.invitationKind） */
type KindFilter = "all" | InvitationKind;
const KIND_FILTER_LABEL: Record<KindFilter, string> = { all: "すべて", friend: "友人用", family: "親族用" };

const NAV_LINK = "inline-flex min-h-11 touch-manipulation items-center rounded-full border border-stone-200 bg-white px-3 text-xs text-stone-600 hover:bg-stone-100 md:min-h-0 md:py-1";

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useGuestSession();
  const { rows, linkedUids, truncated, loading, error } = useAdminGuests(isAdmin);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const onSave = useCallback(async (uid: string, patch: GuestPatch) => {
    await postJson("/api/admin/update-guest", { uid, ...patch });
  }, []);

  const onUnban = useCallback(async (row: GuestRow) => {
    await postJson("/api/admin/update-guest", { uid: row.uid, isActive: true });
    setToast(`${adminName(row)} の停止を解除しました（タグの付け直しが必要です）`);
  }, []);

  const onPasscodeUnlock = useCallback(async (row: GuestRow) => {
    await postJson("/api/admin/passcode-unlock", { uid: row.uid });
    setToast(`${adminName(row) || row.lineDisplayName || row.uid} のパスコード入力を再開できるようにしました`);
  }, []);

  const onApprove = useCallback(async (row: GuestRow, preUid: string) => {
    if (preUid) await postJson("/api/admin/roster", { action: "merge", fromUid: preUid, toUid: row.uid });
    await postJson("/api/admin/update-guest", { uid: row.uid, isApproved: true });
    setToast(preUid ? `${adminName(row)} を承認し、名簿と紐付けました` : `${adminName(row)} を承認しました`);
  }, []);

  // 承認済みの人を、あとから追加した名簿の行と紐付ける（Issue #203）。承認の状態は変えない
  const onLink = useCallback(async (row: GuestRow, preUid: string) => {
    const r = await postJson("/api/admin/roster", { action: "merge", fromUid: preUid, toUid: row.uid });
    setToast(`${adminName(row)} を名簿と紐付けました（顔 ${r.faces ?? 0} 件 / 投稿 ${r.posts ?? 0} 件）`);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const byKind = kindFilter === "all" ? rows : rows.filter((r) => r.invitationKind === kindFilter);
    if (!needle) return byKind;
    return byKind.filter((r) => `${r.displayName} ${r.realName} ${r.nickname} ${r.kana} ${r.lineDisplayName}`.toLowerCase().includes(needle));
  }, [rows, q, kindFilter]);

  const preGuests = useMemo(() => rows.filter((r) => r.isPreRegistered && !r.isRegistered), [rows]);
  // ★停止中のゲストは承認待ちにも承認済みにも出さない★
  //   キューに残っていると、誤って再承認してしまう
  const pending = useMemo(() => filtered.filter((r) => r.isRegistered && !r.isApproved && r.isActive).sort(compareGuests), [filtered]);
  const approved = useMemo(() => filtered.filter((r) => r.isRegistered && r.isApproved && r.isActive).sort(compareGuests), [filtered]);
  // 仮登録（まだ本人がログインしていない名簿行）は停止の対象になりえないので除く
  const banned = useMemo(() => filtered.filter((r) => r.isRegistered && !r.isActive).sort(compareGuests), [filtered]);
  // パスコードを通っていないので isRegistered ではない。LINE ログインはしている
  const passcodeBlocked = useMemo(() => filtered.filter((r) => r.passcodeBlocked), [filtered]);

  // ゲストが登録後に出欠・アレルギーを変えて、まだ確認していない人
  const changedCount = useMemo(() => rows.filter((r) => r.isRegistered && r.isActive && r.answerChange).length, [rows]);

  const stats = useMemo(() => {
    const by: Record<string, number> = {};
    // ★親族用の人は友人用の出欠に数えない★（attendance は "unanswered" のまま。Issue #240。親族は familyStats）
    for (const r of rows) if (r.isRegistered && r.isApproved && r.isActive && r.invitationKind !== "family") by[r.attendance] = (by[r.attendance] ?? 0) + 1;
    return by;
  }, [rows]);

  // 親族用の出欠と前泊（Issue #240）。承認済みの人を数える
  const familyStats = useMemo(() => {
    const by: Record<string, number> = {};
    let stay = 0;
    let total = 0;
    for (const r of rows) {
      if (!(r.isRegistered && r.isApproved && r.isActive && r.invitationKind === "family")) continue;
      total += 1;
      if (r.familyAttendance) by[r.familyAttendance] = (by[r.familyAttendance] ?? 0) + 1;
      if (r.stayPrevNight === true) stay += 1;
    }
    return { by, stay, total };
  }, [rows]);

  // お酒の人数（Issue #147。乾杯の準備用）。承認待ちも含め、回答のある人を数える
  const drinkStats = useMemo(() => {
    const by = DRINK_LEVELS.map(() => 0);
    for (const r of rows) if (r.isRegistered && r.isActive && r.drinkLevel !== null) by[r.drinkLevel] += 1;
    return by;
  }, [rows]);

  function exportCsv() {
    // invitationKind・familyAttendance・stayPrevNight（Issue #240）。親族用の人の「出欠」（友人用）は空にする
    const head = ["uid", "名前", "ニックネーム", "LINE名", "承認", "招待状", "出欠", "挙式", "親族の出欠", "前泊", "お酒", "お車代", "アレルギー", "備考", "送金", "タグ", "メモ"];
    const body = [...pending, ...approved].map((r) => [r.uid, adminName(r), r.nickname, r.lineDisplayName, r.isApproved ? "済" : "未", r.invitationKind === "family" ? "親族用" : "友人用", r.invitationKind === "family" ? "" : ATTENDANCE_LABEL[r.attendance], r.ceremony ? CEREMONY_LABEL[r.ceremony] : "", r.familyAttendance ? FAMILY_ATTENDANCE_LABEL[r.familyAttendance] : "", r.stayPrevNight === null ? "" : r.stayPrevNight ? "あり" : "なし", r.drinkLevel !== null ? DRINK_LEVELS[r.drinkLevel].label : "", r.carFare === null ? "" : r.carFare ? "希望" : "不要", r.allergy, r.note, r.invitationKind === "family" ? "親族（手渡し）" : PAYMENT_LABEL[r.paymentStatus], withoutSystemTags(r.tags).map((t) => tagDef(t).label).join(" "), r.aiMemo]);
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
    <main className="selectable min-h-screen bg-stone-50">
      <div className="mx-auto max-w-[1600px] px-4 py-4 md:py-8">
        <header className="mb-5">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="flex w-full items-center gap-1 md:w-auto">
              <h1 className="font-serif text-xl text-stone-900">ゲスト管理</h1>
              {/* /guestbook・/guide と同じ切り替え。押すとシートが出て、SNS・ご案内へ移れる */}
              <SpaceSwitch current="admin" />
            </div>
            <Link href="/admin/guests" className={NAV_LINK}>招待予定者リスト →</Link>
            <Link href="/admin/episodes" className={NAV_LINK}>エピソード管理 →</Link>
            <Link href="/admin/ai-test" className={NAV_LINK}>AIシミュレーター →</Link>
            <Link href="/admin/faces" className={NAV_LINK}>顔の名寄せ →</Link>
            <Link href="/admin/invitation_test" className={NAV_LINK}>招待状テスト →</Link>
            <Link href="/admin/welcome" className={NAV_LINK}>承認後の写真 →</Link>
            <Link href="/admin/tags" className={NAV_LINK}>タグの管理 →</Link>
            <Link href="/admin/venue-test" className={NAV_LINK}>会場の電波テスト →</Link>
            <Link href="/admin/design" className={NAV_LINK}>デザイン検討 →</Link>
            {/* スマホでは 4 列 × 2 段に折り返す（横スクロールさせない） */}
            <div className="grid w-full grid-cols-4 gap-x-2 gap-y-1 text-sm md:ml-auto md:flex md:w-auto md:items-center md:gap-4">
              <div className="text-center"><p className="tabular-nums text-lg font-semibold text-sky-700">{pending.length}</p><p className="text-[11px] text-stone-400">承認待ち</p></div>
              <div className="text-center"><p className={`tabular-nums text-lg font-semibold ${changedCount > 0 ? "text-rose-600" : "text-stone-300"}`}>{changedCount}</p><p className="text-[11px] text-stone-400">回答の変更</p></div>
              {ATTENDANCE_OPTIONS.map((o) => (
                <div key={o.value} className="text-center"><p className="tabular-nums text-lg font-semibold text-stone-800">{stats[o.value as Attendance] ?? 0}</p><p className="text-[11px] text-stone-400">{o.label}</p></div>
              ))}
            </div>
          </div>
          {familyStats.total > 0 && (
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-stone-500">
              <span className="text-stone-400">親族用（承認済み {familyStats.total}人）:</span>
              {FAMILY_ATTENDANCE_OPTIONS.map((o) => (
                <span key={o.value}>{o.label} <span className="tabular-nums font-semibold text-stone-800">{familyStats.by[o.value] ?? 0}</span>人</span>
              ))}
              <span>前泊 <span className="tabular-nums font-semibold text-stone-800">{familyStats.stay}</span>人</span>
            </p>
          )}
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-stone-500">
            <span className="text-stone-400">お酒（回答済み・承認待ちを含む）:</span>
            {DRINK_LEVELS.map((l) => (
              <span key={l.value}>{l.label} <span className="tabular-nums font-semibold text-stone-800">{drinkStats[l.value]}</span>人</span>
            ))}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・ニックネーム・LINE名で検索" className="min-h-11 min-w-0 flex-1 rounded-lg border border-stone-200 px-3 text-base outline-none focus:border-stone-400 md:min-h-0 md:min-w-[220px] md:py-1.5 md:text-sm" />
            {/* スマホでは検索欄の下の段に置く（検索欄を狭めない） */}
            <div role="tablist" aria-label="招待状の種類で絞り込む" className="order-last flex w-full gap-1 md:order-none md:w-auto">
              {(["all", "friend", "family"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kindFilter === k}
                  onClick={() => setKindFilter(k)}
                  className={`min-h-11 touch-manipulation rounded-full px-3 text-xs md:min-h-0 md:py-1.5 ${kindFilter === k ? "bg-stone-900 text-white" : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"}`}
                >
                  {KIND_FILTER_LABEL[k]}
                </button>
              ))}
            </div>
            <button type="button" onClick={exportCsv} className="min-h-11 touch-manipulation rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-600 hover:bg-stone-100 md:min-h-0 md:py-1.5">CSV</button>
          </div>
        </header>

        {truncated && <TruncatedWarning />}
        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">読み込みに失敗しました</div> : loading ? <div className="h-64 animate-pulse rounded-2xl bg-stone-200/60" /> : (
          <div className="space-y-8">
            <section>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><h2 className="text-sm font-semibold text-stone-800">承認待ち</h2><p className="text-xs text-stone-400">LINE ログイン直後のゲストです。名簿の誰かを選んでから「承認する」を押すと紐付きます。候補に出るのは、招待予定者リストの「名簿」の行（まだ誰とも紐付いていないもの）だけです。</p></div>
              <GuestTable mode="pending" rows={pending} preGuests={preGuests} onSave={onSave} onApprove={onApprove} />
            </section>
            <section>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><h2 className="text-sm font-semibold text-stone-800">本登録（承認済み）</h2><p className="text-xs text-stone-400">あとから招待予定者リストに追加した人は、行の「名簿と紐付ける」で紐付けられます。</p></div>
              <GuestTable mode="approved" rows={approved} preGuests={preGuests} linkedUids={linkedUids} onSave={onSave} onLink={onLink} />
            </section>
            <section>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><h2 className="text-sm font-semibold text-stone-800">非表示の投稿</h2><p className="text-xs text-stone-400">ゲストブックで投稿を開き「非表示にする（管理者）」を押すとここに入ります。コメントも一緒に隠れます。</p></div>
              <HiddenPosts enabled={isAdmin} />
            </section>
            <section>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><h2 className="text-sm font-semibold text-stone-800">LINE の通知の再送</h2><p className="text-xs text-stone-400">失敗した通知は、先に ops.mjs notify retry で送信待ちに戻してから押してください。重複して届くことはありません。</p></div>
              <LineNotifyRetry />
            </section>

            {passcodeBlocked.length > 0 && (
              <section>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h2 className="text-sm font-semibold text-rose-800">パスコードで停止中</h2>
                  <p className="text-xs text-stone-400">パスコードを10回間違えて入力を止めています。ご本人と確認できたら解除してください（総当たりの可能性もあります）。</p>
                </div>
                <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
                  {passcodeBlocked.map((r) => (
                    <li key={r.uid} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm text-stone-700">{r.lineDisplayName || adminName(r) || "（名前なし）"}</span>
                      <span className="min-w-0 truncate font-mono text-xs text-stone-400">{r.uid}</span>
                      <button type="button" onClick={() => void onPasscodeUnlock(r)} className="ml-auto min-h-11 shrink-0 touch-manipulation rounded-full border border-stone-200 px-3 text-xs text-stone-600 hover:bg-stone-100 md:min-h-0 md:py-1">入力を再開させる</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {banned.length > 0 && (
              <section>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h2 className="text-sm font-semibold text-rose-800">アクセス停止中</h2>
                  <p className="text-xs text-stone-400">タグが空になり、手持ちのログインも失効しています。解除後はタグの付け直しが必要です。</p>
                </div>
                <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
                  {banned.map((r) => (
                    <li key={r.uid} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm text-stone-700">{adminName(r)}</span>
                      <span className="min-w-0 truncate text-xs text-stone-400">{r.bannedReason || "理由の記録なし"}</span>
                      <button type="button" onClick={() => void onUnban(r)} className="ml-auto min-h-11 shrink-0 touch-manipulation rounded-full border border-stone-200 px-3 text-xs text-stone-600 hover:bg-stone-100 md:min-h-0 md:py-1">停止を解除</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
      {toast && <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-50 max-w-[calc(100vw-2rem)] md:bottom-6 -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-sm text-white shadow-lg">{toast}</div>}
    </main>
  );
}
