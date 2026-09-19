"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { putJson } from "@/lib/api-client";
import { TAG_DEFS, tagDef } from "@/config/tags";
import { EPISODE_PERIODS, MAX_EPISODE_CONTENT, themeDef } from "@/config/episodes";
import { adminName } from "@/lib/names";
import { compareGuests } from "@/lib/roster";
import type { GuestRow } from "@/types/admin";
import type { Episode } from "@/types/episode";

export function EpisodeModal({
  episode,
  guests,
  onClose,
  onSaved,
}: {
  episode: Episode;
  guests: GuestRow[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [title, setTitle] = useState(episode.title);
  const [period, setPeriod] = useState(episode.period);
  const [content, setContent] = useState(episode.content || episode.originalText);
  const [targetTags, setTargetTags] = useState<string[]>(episode.targetTags);
  const [targetUids, setTargetUids] = useState<string[]>(episode.targetUids);
  const [visibleToTags, setVisibleToTags] = useState<string[]>(
    episode.visibleToTags.length > 0 ? episode.visibleToTags : ["all"],
  );
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theme = themeDef(episode.theme);

  const sortedGuests = useMemo(
    () => [...guests].filter((g) => g.invitationStatus !== "declined").sort(compareGuests),
    [guests],
  );
  const byUid = useMemo(() => new Map(sortedGuests.map((g) => [g.uid, g])), [sortedGuests]);

  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sortedGuests
      .filter((g) => !targetUids.includes(g.uid))
      .filter((g) =>
        !needle ||
        `${g.displayName} ${g.realName} ${g.nickname} ${g.kana}`.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [sortedGuests, targetUids, q]);

  function toggle(list: string[], set: (v: string[]) => void, id: string) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function save(nextStatus?: Episode["status"]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await putJson("/api/admin/episodes", {
        id: episode.id,
        ...(nextStatus ? { status: nextStatus } : {}),
        title, period, content, targetTags, targetUids, visibleToTags,
      });
      onSaved(
        nextStatus === "approved" ? "承認しました"
        : nextStatus === "rejected" ? "非表示にしました"
        : "保存しました",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const chip = "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition";
  const inputClass =
    "w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm text-stone-800 outline-none focus:border-stone-400 focus:bg-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white">
        <header className="flex shrink-0 items-center gap-3 border-b border-stone-100 px-4 py-3">
          <span className={`${chip} ${theme.className}`}>{theme.label}</span>
          <p className="min-w-0 flex-1 truncate text-sm text-stone-500">
            {episode.authorName} さんの投稿
            <span className="ml-2 text-xs text-stone-400">
              {episode.createdAt
                ? new Date(episode.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
                : ""}
            </span>
          </p>
          <button type="button" onClick={onClose} aria-label="閉じる"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
            ×
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto md:grid-cols-2">
          {/* ---- 左: ゲストの生投稿（編集しない） ---- */}
          <div className="border-b border-stone-100 bg-stone-50/60 p-4 md:border-b-0 md:border-r">
            <p className="mb-2 text-xs font-semibold text-stone-500">ゲストの投稿（原文）</p>

            {episode.photoUrls.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                {episode.photoUrls.slice(0, 4).map((url, i) => (
                  <div key={`${url}-${i}`}
                    className="relative aspect-square overflow-hidden rounded-lg bg-stone-200">
                    <Image src={url} alt="" fill sizes="(max-width: 768px) 50vw, 240px"
                      className="object-cover" />
                  </div>
                ))}
              </div>
            )}

            <p className="whitespace-pre-wrap break-words rounded-xl border border-stone-200 bg-white p-3 text-sm leading-relaxed text-stone-700">
              {episode.originalText || "（本文なし）"}
            </p>

            <button type="button" onClick={() => setContent(episode.originalText)}
              className="mt-2 text-xs text-stone-400 underline hover:text-stone-700">
              原文を右の本文に上書きコピー
            </button>

            <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
              {theme.prompt}
            </p>
          </div>

          {/* ---- 右: 管理者の編集フォーム ---- */}
          <div className="space-y-4 p-4">
            <label className="block">
              <span className="text-xs font-medium text-stone-600">タイトル（管理用）</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
                placeholder="例）合宿でひとりだけ寝坊した話" className={`mt-1 ${inputClass}`} />
            </label>

            <div>
              <span className="text-xs font-medium text-stone-600">時期</span>
              <input value={period} onChange={(e) => setPeriod(e.target.value)} maxLength={40}
                placeholder="例）大学生" className={`mt-1 ${inputClass}`} />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {EPISODE_PERIODS.map((p) => (
                  <button key={p} type="button" onClick={() => setPeriod(p)}
                    className={`${chip} ${
                      period === p ? "bg-stone-900 text-white ring-stone-900"
                                   : "bg-white text-stone-500 ring-stone-200 hover:bg-stone-50"
                    }`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-stone-600">
                本文（AI に読ませる文章）
                <span className="ml-1.5 font-normal tabular-nums text-stone-400">
                  {content.length}/{MAX_EPISODE_CONTENT}
                </span>
              </span>
              <textarea value={content} onChange={(e) => setContent(e.target.value)}
                rows={7} maxLength={MAX_EPISODE_CONTENT}
                placeholder="固有名詞を補い、主語を明確にしておくと AI の回答が安定します"
                className={`mt-1 resize-y ${inputClass} leading-relaxed`} />
            </label>

            <div>
              <span className="text-xs font-medium text-stone-600">
                誰についての話か（グループ）
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {TAG_DEFS.map((t) => {
                  const on = targetTags.includes(t.id);
                  return (
                    <button key={t.id} type="button"
                      onClick={() => toggle(targetTags, setTargetTags, t.id)}
                      className={`${chip} ${on ? t.className : "bg-white text-stone-400 ring-stone-200 hover:bg-stone-50"}`}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="text-xs font-medium text-stone-600">
                誰についての話か（個人）
              </span>
              {targetUids.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {targetUids.map((uid) => {
                    const g = byUid.get(uid);
                    return (
                      <span key={uid}
                        className={`${chip} inline-flex items-center gap-1 bg-stone-900 text-white ring-stone-900`}>
                        {g ? adminName(g) : uid.slice(0, 10)}
                        <button type="button" aria-label="外す"
                          onClick={() => setTargetUids(targetUids.filter((x) => x !== uid))}
                          className="opacity-60 hover:opacity-100">×</button>
                      </span>
                    );
                  })}
                </div>
              )}
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="名前で検索して追加" className={`mt-1.5 ${inputClass}`} />
              {q.trim() && (
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-stone-200">
                  {candidates.length === 0 ? (
                    <li className="p-3 text-center text-xs text-stone-400">該当なし</li>
                  ) : (
                    candidates.map((g) => (
                      <li key={g.uid}>
                        <button type="button"
                          onClick={() => { setTargetUids([...targetUids, g.uid]); setQ(""); }}
                          className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-stone-100">
                          <span className="text-sm text-stone-800">{adminName(g)}</span>
                          <span className="truncate text-[10px] text-stone-400">
                            {g.kana}
                            {g.isPreRegistered ? " ・未ログイン" : ""}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <span className="text-xs font-medium text-amber-900">
                公開範囲（誰に見せてよいか）
              </span>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
                ★上の「誰についての話か」とは別物です。
                ミニAI はここで許可した相手にしかこのエピソードを使いません。
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {TAG_DEFS.map((t) => {
                  const on = visibleToTags.includes(t.id);
                  return (
                    <button key={t.id} type="button"
                      onClick={() => toggle(visibleToTags, setVisibleToTags, t.id)}
                      className={`${chip} ${on ? t.className : "bg-white text-stone-400 ring-stone-200 hover:bg-stone-50"}`}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-stone-100 p-4">
          <button type="button" onClick={() => void save("rejected")} disabled={busy}
            className="rounded-full px-4 py-2 text-sm text-stone-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
            非表示にする
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} disabled={busy}
              className="rounded-full border border-stone-200 px-5 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50">
              {busy ? "保存中…" : "下書き保存"}
            </button>
            <button type="button" onClick={() => void save("approved")}
              disabled={busy || visibleToTags.length === 0 || !content.trim()}
              className="rounded-full bg-stone-900 px-6 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40">
              承認して保存
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
