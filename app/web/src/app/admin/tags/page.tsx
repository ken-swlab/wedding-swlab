"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { patchJson } from "@/lib/api-client";
import { useGuestSession } from "@/hooks/useGuestSession";
import { ADMIN_GUESTS_LIMIT } from "@/hooks/useAdminGuests";
import { useVisualViewportFrame } from "@/hooks/useVisualViewportFrame";
import { refreshTagCache, useCustomTags } from "@/lib/tags-client";
import { MAX_TAG_LABEL, PALETTE_KEYS, TAG_DEFS, TAG_PALETTES, paletteClass, upsertCustomTag, type TagDef } from "@/config/tags";

/**
 * タグの管理（Issue #221）。作ったタグの名前・色・コミュニティを、あとから直す。
 *
 * ★書き込みは /api/admin/tags の PATCH だけ★（監査ログ・レートリミットはそこに付いている）。
 *   API は組み込みタグの変更を断る。この画面でも組み込みタグには編集の入口を出さない（鍵マーク）。
 * ★消さずにアーカイブする★ タグの ID は Custom Claims と公開範囲（visibleToTags）に入っているので、
 *   物理削除すると権限と表示が壊れる。アーカイブはピッカーに出なくなるだけで、付いている人のタグと権限は残る。
 * ★ID・Claims・Rules・公開範囲は変えない★ 名前・色は、どの画面も ID からタグの辞書（lib/tags-client.ts の購読）を
 *   引いて出すので、保存すればすぐ反映される。コミュニティのタブも同じ辞書の community を見る。
 * ★仕組み用のタグ（system）は出さない★（Issue #204）。表示しないだけで、データは変えない。
 *   CTF のタグ（選べない組み込みタグ）も出さない（CTF 機能は保留中。CLAUDE.md）。
 * 人数は guests の tags から数える（統合済み・アーカイブ済みの行は除く）。名簿だけの仮登録の行も含む。
 */

/** 一覧に出す組み込みタグ。仕組み用・選べないもの（CTF）は出さない */
const BUILTIN_TAGS = TAG_DEFS.filter((t) => t.system !== true && t.selectable);
const BUILTIN_LABELS = new Set(TAG_DEFS.map((t) => t.label));

const BTN = "min-h-11 touch-manipulation rounded-full px-3 text-xs";

type Counts = { byTag: Record<string, number>; truncated: boolean };

/** guests の tags から、タグごとの人数を数える（guests だけを読む。本名などは読まない） */
function useTagCounts(enabled: boolean): Counts | null {
  const [counts, setCounts] = useState<Counts | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      query(collection(db, "guests"), limit(ADMIN_GUESTS_LIMIT)),
      (snap) => {
        const byTag: Record<string, number> = {};
        for (const d of snap.docs) {
          const v = d.data();
          if (v.mergedInto || v.isArchived === true || !Array.isArray(v.tags)) continue;
          for (const t of new Set<unknown>(v.tags)) if (typeof t === "string") byTag[t] = (byTag[t] ?? 0) + 1;
        }
        setCounts({ byTag, truncated: snap.size >= ADMIN_GUESTS_LIMIT });
      },
      (e) => console.error("[admin/tags] 人数の読み込みに失敗", e),
    );
  }, [enabled]);
  return counts;
}

export default function AdminTagsPage() {
  const { user, isAdmin, loading: authLoading } = useGuestSession();
  const custom = useCustomTags();
  const counts = useTagCounts(isAdmin);
  const [editing, setEditing] = useState<TagDef | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const active = useMemo(() => custom.filter((t) => !t.archived), [custom]);
  const archived = useMemo(() => custom.filter((t) => t.archived), [custom]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  /** ほかのタグ（組み込み・アーカイブしていないカスタム）と同じ名前か */
  function labelTaken(label: string, selfId: string): boolean {
    return BUILTIN_LABELS.has(label) || custom.some((t) => t.id !== selfId && !t.archived && t.label === label);
  }

  /** ↑↓ で並び順を入れ替える。order は 0 から振り直し、変わったタグだけ送る */
  async function move(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (busy || to < 0 || to >= active.length) return;
    const next = [...active];
    [next[index], next[to]] = [next[to], next[index]];
    setBusy(true);
    try {
      for (let i = 0; i < next.length; i++) {
        if (next[i].order === i) continue;
        await patchJson("/api/admin/tags", { id: next[i].id, order: i });
        upsertCustomTag({ ...next[i], order: i });
      }
      refreshTagCache();
    } catch (e) {
      alert(e instanceof Error ? e.message : "並び順を変えられませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function restore(t: TagDef) {
    if (busy) return;
    if (labelTaken(t.label, t.id)) {
      alert(`「${t.label}」という名前のタグがほかにあります。先にどちらかの名前を変えてください`);
      return;
    }
    setBusy(true);
    try {
      // 戻したタグは今の並びの最後に置く（ほかのタグと order が重ならないよう、最大の値の次）
      const order = active.reduce((m, x) => Math.max(m, (x.order ?? 0) + 1), 0);
      await patchJson("/api/admin/tags", { id: t.id, archived: false, order });
      upsertCustomTag({ ...t, archived: false, order });
      refreshTagCache();
      setToast(`「${t.label}」を戻しました`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "戻せませんでした");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) return <main className="min-h-screen bg-stone-50 p-8"><div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" /></main>;
  if (!user || !isAdmin) return <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8"><div className="max-w-sm rounded-2xl border border-stone-200 bg-white p-8 text-center"><p className="font-medium text-stone-800">管理者専用ページです</p></div></main>;

  return (
    <main className="selectable min-h-screen bg-stone-50" style={{ paddingBottom: "calc(3rem + env(safe-area-inset-bottom))" }}>
      <div className="mx-auto max-w-2xl px-4 py-4 md:py-8">
        <header className="mb-5">
          <Link href="/admin" className="inline-flex min-h-11 touch-manipulation items-center text-xs text-stone-500 hover:text-stone-800">← ゲスト管理</Link>
          <h1 className="font-serif text-xl text-stone-900">タグの管理</h1>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            作ったタグの名前・色・コミュニティを直せます。新しいタグは、ゲスト管理のタグの「＋」から作ります。
          </p>
        </header>

        {counts?.truncated && (
          <p role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ゲストが {ADMIN_GUESTS_LIMIT} 件を超えているため、人数は少なめに出ている可能性があります。
          </p>
        )}

        <section aria-labelledby="tags-custom" className="mb-6">
          <h2 id="tags-custom" className="mb-2 font-serif text-sm text-stone-800">作ったタグ</h2>
          {active.length === 0 ? (
            <p className="rounded-2xl border border-stone-200/80 bg-white p-4 text-sm text-stone-500 shadow-sm">まだありません。</p>
          ) : (
            <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200/80 bg-white shadow-sm">
              {active.map((t, i) => (
                <TagRow key={t.id} tag={t} count={counts ? (counts.byTag[t.id] ?? 0) : undefined}>
                  <div className="flex shrink-0 items-center">
                    <button type="button" disabled={busy || i === 0} onClick={() => void move(i, -1)} aria-label={`${t.label} を上へ`} className={`${BTN} w-9 px-0 text-stone-500 disabled:opacity-30`}>↑</button>
                    <button type="button" disabled={busy || i === active.length - 1} onClick={() => void move(i, 1)} aria-label={`${t.label} を下へ`} className={`${BTN} w-9 px-0 text-stone-500 disabled:opacity-30`}>↓</button>
                    <button type="button" disabled={busy} onClick={() => setEditing(t)} className={`${BTN} border border-stone-200 text-stone-700 hover:bg-stone-100 disabled:opacity-40`}>編集</button>
                  </div>
                </TagRow>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="tags-builtin" className="mb-6">
          <h2 id="tags-builtin" className="mb-1 font-serif text-sm text-stone-800">組み込みのタグ</h2>
          <p className="mb-2 text-xs text-stone-500">あらかじめ用意したタグです。名前・色・コミュニティは変えられません。</p>
          <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200/80 bg-white shadow-sm">
            {BUILTIN_TAGS.map((t) => (
              <TagRow key={t.id} tag={t} count={counts ? (counts.byTag[t.id] ?? 0) : undefined}>
                <span className="flex min-h-11 shrink-0 items-center px-3 text-stone-400" role="img" aria-label="組み込みのタグ（編集できません）">
                  <LockIcon />
                </span>
              </TagRow>
            ))}
          </ul>
        </section>

        {archived.length > 0 && (
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer touch-manipulation list-none items-center gap-1 font-serif text-sm text-stone-800">
              <span className="text-stone-400 transition-transform group-open:rotate-90">▸</span>
              アーカイブしたタグ（{archived.length}）
            </summary>
            <p className="mb-2 text-xs text-stone-500">タグを選ぶ一覧には出ません。付いている人のタグと権限は残っています。</p>
            <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200/80 bg-white shadow-sm">
              {archived.map((t) => (
                <TagRow key={t.id} tag={t} count={counts ? (counts.byTag[t.id] ?? 0) : undefined}>
                  <button type="button" disabled={busy} onClick={() => void restore(t)} className={`${BTN} shrink-0 border border-stone-200 text-stone-700 hover:bg-stone-100 disabled:opacity-40`}>戻す</button>
                </TagRow>
              ))}
            </ul>
          </details>
        )}
      </div>

      {editing && (
        <EditSheet
          tag={editing}
          labelTaken={(label) => labelTaken(label, editing.id)}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setToast(message);
          }}
        />
      )}

      {toast && (
        <div role="status" className="fixed inset-x-4 z-50 mx-auto max-w-sm rounded-full bg-stone-900 px-4 py-2.5 text-center text-sm text-white shadow-lg" style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          {toast}
        </div>
      )}
    </main>
  );
}

/** 1行: 色の見本つきのタグ名・コミュニティ（オン／オフ）・付いている人数・操作 */
function TagRow({ tag, count, children }: { tag: TagDef; count: number | undefined; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 py-1 pl-3 pr-1">
      <div className="min-w-0 flex-1">
        <span className={`inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tag.className}`}>
          <span className="truncate">{tag.label}</span>
        </span>
        <p className="mt-0.5 flex gap-3 text-[11px] text-stone-500">
          <span className={tag.community ? "font-medium text-emerald-700" : ""}>コミュニティ {tag.community ? "オン" : "オフ"}</span>
          <span>
            <span className="font-serif tabular-nums">{count ?? "–"}</span> 人
          </span>
        </p>
      </div>
      {children}
    </li>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** パレットのキー（Firestore に保存した値）を、TagDef の className から引き戻す */
function paletteOf(tag: TagDef): string {
  return PALETTE_KEYS.find((k) => TAG_PALETTES[k] === tag.className) ?? "stone";
}

/**
 * 編集のシート（カスタムタグだけ）。保存は「保存」で1回の PATCH。一番下にアーカイブ。
 * ★入力欄の文字は 16px 以上★ iOS は 16px 未満の入力欄にフォーカスすると画面を拡大する（TagPicker と同じ。Issue #126）。
 * ★シートは見えている範囲に合わせる★（useVisualViewportFrame）キーボードが開いても、保存ボタンが隠れない。
 */
function EditSheet({
  tag,
  labelTaken,
  onClose,
  onSaved,
}: {
  tag: TagDef;
  labelTaken: (label: string) => boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [label, setLabel] = useState(tag.label);
  const [palette, setPalette] = useState(() => paletteOf(tag));
  const [community, setCommunity] = useState(tag.community === true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const frameRef = useRef<HTMLDivElement | null>(null);
  useVisualViewportFrame(frameRef);

  // 表示中は後ろの一覧をスクロールさせない
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const trimmed = label.trim();
  const changed = trimmed !== tag.label || palette !== paletteOf(tag) || community !== (tag.community === true);

  async function save() {
    if (busy) return;
    // 文字数の数え方は API（/api/admin/tags の label.length）と入力欄の maxLength に合わせる
    if (!trimmed || trimmed.length > MAX_TAG_LABEL) {
      setErr(`タグ名は1〜${MAX_TAG_LABEL}文字です`);
      return;
    }
    if (labelTaken(trimmed)) {
      setErr(`「${trimmed}」は既に存在します`);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await patchJson("/api/admin/tags", { id: tag.id, label: trimmed, palette, community });
      // 購読（onSnapshot）でも届くが、待たずに手元の辞書へ反映する
      upsertCustomTag({ ...tag, label: trimmed, className: paletteClass(palette), community });
      refreshTagCache();
      onSaved(`「${trimmed}」を保存しました`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
      setBusy(false);
    }
  }

  async function archive() {
    if (busy) return;
    if (!confirm(`「${tag.label}」をアーカイブします。\nピッカーに出なくなります。付いている人のタグや権限は残ります。`)) return;
    setBusy(true);
    setErr("");
    try {
      await patchJson("/api/admin/tags", { id: tag.id, archived: true });
      upsertCustomTag({ ...tag, archived: true });
      refreshTagCache();
      onSaved(`「${tag.label}」をアーカイブしました`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "アーカイブできませんでした");
      setBusy(false);
    }
  }

  return createPortal(
    <div
      ref={frameRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tag-edit-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      className="fixed inset-x-0 top-0 z-50 flex h-dvh items-end justify-center bg-black/40"
    >
      <div
        className="max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-4 pt-2 shadow-xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <p id="tag-edit-title" className="font-serif text-base text-stone-900">タグを編集</p>
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 touch-manipulation px-2 text-sm text-stone-500 disabled:opacity-40">
            閉じる
          </button>
        </div>

        <div className="space-y-5 pb-2 pt-1">
          <div>
            <label htmlFor="tag-edit-label" className="mb-1 block text-xs font-medium text-stone-700">名前</label>
            <input
              id="tag-edit-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={MAX_TAG_LABEL}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-base text-stone-900 focus:border-stone-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-stone-400">1〜{MAX_TAG_LABEL}文字</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-stone-700">色</p>
            <div className="flex flex-wrap gap-2">
              {PALETTE_KEYS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={p}
                  aria-pressed={palette === p}
                  onClick={() => setPalette(p)}
                  className={`h-9 w-9 touch-manipulation rounded-full ring-1 ring-inset ${paletteClass(p)} ${
                    palette === p ? "outline outline-2 outline-offset-1 outline-stone-800" : ""
                  }`}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-stone-400">
              見本：
              <span className={`ml-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${paletteClass(palette)}`}>
                {trimmed || tag.label}
              </span>
            </p>
          </div>

          <label className="flex items-start gap-2.5">
            <input type="checkbox" checked={community} onChange={(e) => setCommunity(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              <span className="block text-sm font-medium text-stone-800">コミュニティとして使う</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">
                オンにすると、このタグの人がコミュニティで仲間（参加予定のメンバー）を見られます
              </span>
            </span>
          </label>

          {err && <p role="alert" className="text-xs text-rose-600">{err}</p>}

          <button
            type="button"
            disabled={busy || !changed}
            onClick={() => void save()}
            className="min-h-11 w-full touch-manipulation rounded-full bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
          >
            {busy ? "保存中…" : "保存"}
          </button>

          <div className="border-t border-stone-100 pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void archive()}
              className="min-h-11 w-full touch-manipulation rounded-full border border-rose-200 px-4 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-40"
            >
              アーカイブ
            </button>
            <p className="mt-1.5 text-center text-[11px] leading-relaxed text-stone-400">
              ピッカーに出なくなります。付いている人のタグや権限は残ります
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
