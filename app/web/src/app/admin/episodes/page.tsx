"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { postJson, putJson } from "@/lib/api-client";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useAdminGuests } from "@/hooks/useAdminGuests";
import { useEpisodes } from "@/hooks/useEpisodes";
import { EpisodeModal } from "@/components/admin/EpisodeModal";
import { EPISODE_THEMES, themeDef } from "@/config/episodes";
import { tagDef } from "@/config/tags";
import { adminName } from "@/lib/names";
import type { Episode } from "@/types/episode";

function shortDate(ms: number) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
  });
}

export default function AdminEpisodesPage() {
  const { user, isAdmin, loading: authLoading } = useGuestSession();
  const { rows } = useAdminGuests(isAdmin);
  const { episodes, loading, error, refresh } = useEpisodes(isAdmin);

  const [editing, setEditing] = useState<Episode | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const pending = useMemo(() => episodes.filter((e) => e.status === "pending"), [episodes]);
  const approved = useMemo(() => episodes.filter((e) => e.status === "approved"), [episodes]);
  const rejected = useMemo(() => episodes.filter((e) => e.status === "rejected"), [episodes]);

  const byUid = useMemo(() => new Map(rows.map((g) => [g.uid, g])), [rows]);

  const onSaved = useCallback(async (message: string) => {
    setEditing(null);
    setToast(message);
    await refresh();
  }, [refresh]);

  const setStatus = useCallback(async (ep: Episode, status: Episode["status"], msg: string) => {
    try {
      await putJson("/api/admin/episodes", { id: ep.id, status });
      setToast(msg);
      await refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "失敗しました");
    }
  }, [refresh]);

  /** ゲスト向けの投稿フォームができるまでの動作確認用 */
  const seed = useCallback(async () => {
    if (!user) return;
    setSeeding(true);
    try {
      const theme = EPISODE_THEMES[Math.floor(Math.random() * 5)];
      await postJson("/api/admin/episodes", {
        authorUid: user.uid,
        theme: theme.id,
        originalText: `${theme.prompt}\n\n（テスト投稿）ここにゲストが書いたエピソードが入ります。`,
        photoUrls: [],
      });
      setToast("テスト投稿を作成しました");
      await refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setSeeding(false);
    }
  }, [user, refresh]);

  if (authLoading) {
    return <main className="min-h-screen bg-stone-50 p-8"><div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" /></main>;
  }
  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8">
        <p className="text-sm text-stone-600">管理者専用ページです</p>
      </main>
    );
  }

  const th = "border-b border-stone-200 px-3 py-2";

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <header className="mb-5">
          <Link href="/admin" className="text-xs text-stone-400 hover:text-stone-700">
            ← ゲスト管理に戻る
          </Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-serif text-xl text-stone-900">エピソード管理</h1>
              <p className="mt-1 text-sm leading-relaxed text-stone-500">
                ゲストから集めた思い出を、ミニAI が読める形に整えます。
                承認したものだけが当日の会話とムービーの素材になります。
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <p className="tabular-nums text-lg font-semibold text-sky-700">{pending.length}</p>
                <p className="text-[11px] text-stone-400">未承認</p>
              </div>
              <div className="text-center">
                <p className="tabular-nums text-lg font-semibold text-emerald-700">{approved.length}</p>
                <p className="text-[11px] text-stone-400">承認済</p>
              </div>
              <div className="text-center">
                <p className="tabular-nums text-lg font-semibold text-stone-400">{rejected.length}</p>
                <p className="text-[11px] text-stone-400">非表示</p>
              </div>
              <button type="button" onClick={() => void seed()} disabled={seeding}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50">
                {seeding ? "作成中…" : "テスト投稿"}
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        ) : loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-stone-200/60" />
        ) : (
          <div className="space-y-8">
            {/* ---- 未承認 ---- */}
            <section>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-stone-800">未承認</h2>
                <p className="text-xs text-stone-400">
                  ゲストからの新着です。内容を整えて承認してください。
                </p>
              </div>

              {pending.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">
                  未承認のエピソードはありません
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                  <table className="w-full min-w-[980px] border-collapse text-sm">
                    <thead className="bg-stone-50 text-left text-xs font-semibold text-stone-500">
                      <tr>
                        <th className={`w-20 ${th}`}>投稿日</th>
                        <th className={`w-40 ${th}`}>投稿者</th>
                        <th className={`w-28 ${th}`}>お題</th>
                        <th className={th}>本文（抜粋）</th>
                        <th className={`w-36 ${th}`}>写真</th>
                        <th className={`w-32 ${th}`}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((ep) => {
                        const t = themeDef(ep.theme);
                        const g = byUid.get(ep.authorUid);
                        return (
                          <tr key={ep.id} className="bg-sky-50/40 align-top hover:bg-sky-50/70">
                            <td className="border-b border-stone-200 px-3 py-3 text-xs tabular-nums text-stone-500">
                              {shortDate(ep.createdAt)}
                            </td>
                            <td className="border-b border-stone-200 px-3 py-3">
                              <p className="truncate font-medium text-stone-800">
                                {g ? adminName(g) : ep.authorName}
                              </p>
                              <p className="truncate text-[10px] text-stone-400">{ep.authorName}</p>
                            </td>
                            <td className="border-b border-stone-200 px-3 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${t.className}`}>
                                {t.label}
                              </span>
                            </td>
                            <td className="border-b border-stone-200 px-3 py-3">
                              <p className="line-clamp-2 text-xs leading-relaxed text-stone-600">
                                {ep.originalText || "（本文なし）"}
                              </p>
                            </td>
                            <td className="border-b border-stone-200 px-3 py-2">
                              <div className="flex gap-1">
                                {ep.photoUrls.slice(0, 3).map((url, i) => (
                                  <span key={`${url}-${i}`}
                                    className="relative h-10 w-10 overflow-hidden rounded-md bg-stone-200">
                                    <Image src={url} alt="" fill sizes="40px" className="object-cover" />
                                  </span>
                                ))}
                                {ep.photoUrls.length === 0 && (
                                  <span className="text-[10px] text-stone-300">—</span>
                                )}
                              </div>
                            </td>
                            <td className="border-b border-stone-200 px-3 py-3 text-right">
                              <button type="button" onClick={() => setEditing(ep)}
                                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700">
                                確認・承認する
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ---- 承認済み ---- */}
            <section>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-stone-800">承認済み</h2>
                <p className="text-xs text-stone-400">
                  ミニAI とムービーが使うのはこの一覧です。
                </p>
              </div>

              {approved.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">
                  承認済みのエピソードはまだありません
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                  <table className="w-full min-w-[980px] border-collapse text-sm">
                    <thead className="bg-stone-50 text-left text-xs font-semibold text-stone-500">
                      <tr>
                        <th className={th}>タイトル</th>
                        <th className={`w-32 ${th}`}>時期</th>
                        <th className={`w-72 ${th}`}>誰についての話か</th>
                        <th className={`w-44 ${th}`}>公開範囲</th>
                        <th className={`w-32 ${th}`}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {approved.map((ep) => {
                        const t = themeDef(ep.theme);
                        return (
                          <tr key={ep.id} className="align-top hover:bg-stone-50/60">
                            <td className="border-b border-stone-200 px-3 py-3">
                              <p className="font-medium text-stone-900">
                                {ep.title || "（タイトル未設定）"}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-stone-400">
                                <span className={`rounded-full px-1.5 py-0.5 ring-1 ring-inset ${t.className}`}>
                                  {t.label}
                                </span>
                                {ep.authorName}
                              </p>
                            </td>
                            <td className="border-b border-stone-200 px-3 py-3 text-xs text-stone-600">
                              {ep.period || "—"}
                            </td>
                            <td className="border-b border-stone-200 px-3 py-3">
                              <div className="flex flex-wrap gap-1">
                                {ep.targetTags.map((id) => (
                                  <span key={id}
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${tagDef(id).className}`}>
                                    {tagDef(id).label}
                                  </span>
                                ))}
                                {ep.targetUids.map((uid) => {
                                  const g = byUid.get(uid);
                                  return (
                                    <span key={uid}
                                      className="rounded-full bg-stone-900 px-1.5 py-0.5 text-[10px] text-white">
                                      {g ? adminName(g) : uid.slice(0, 8)}
                                    </span>
                                  );
                                })}
                                {ep.targetTags.length === 0 && ep.targetUids.length === 0 && (
                                  <span className="text-[10px] text-amber-600">未設定</span>
                                )}
                              </div>
                            </td>
                            <td className="border-b border-stone-200 px-3 py-3">
                              <div className="flex flex-wrap gap-1">
                                {ep.visibleToTags.map((id) => (
                                  <span key={id}
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${tagDef(id).className}`}>
                                    {tagDef(id).label}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="border-b border-stone-200 px-3 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <button type="button" onClick={() => setEditing(ep)}
                                  className="rounded-md border border-stone-200 px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-50">
                                  編集
                                </button>
                                <button type="button"
                                  onClick={() => void setStatus(ep, "rejected", "非表示にしました")}
                                  className="rounded-md border border-stone-200 px-2.5 py-1 text-xs text-stone-400 hover:bg-rose-50 hover:text-rose-600">
                                  非表示
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ---- 非表示 ---- */}
            {rejected.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-stone-500">非表示</h2>
                <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
                  {rejected.map((ep) => (
                    <li key={ep.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-stone-400">
                        {ep.title || ep.originalText.slice(0, 40) || "（本文なし）"}
                      </span>
                      <button type="button"
                        onClick={() => void setStatus(ep, "pending", "未承認に戻しました")}
                        className="shrink-0 rounded-md border border-stone-200 px-2.5 py-1 text-xs text-stone-500 hover:bg-stone-50">
                        未承認に戻す
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      {editing && (
        <EpisodeModal
          episode={editing}
          guests={rows}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
