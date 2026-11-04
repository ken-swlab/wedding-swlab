"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { patchJson, postJson } from "@/lib/api-client";
import { useGuestSession } from "@/hooks/useGuestSession";
import { ADMIN_GUESTS_LIMIT } from "@/hooks/useAdminGuests";
import { useVisualViewportFrame } from "@/hooks/useVisualViewportFrame";
import { refreshTagCache, toTagDef, useOrderedTags, useTagOrderState, type CustomTagDoc } from "@/lib/tags-client";
import {
  LOCKED_TAG_IDS,
  MAX_TAG_LABEL,
  PALETTE_KEYS,
  TAG_PALETTES,
  canEditTag,
  canHideTag,
  paletteClass,
  upsertCustomTag,
  type TagDef,
} from "@/config/tags";

/**
 * タグの管理（Issue #221・#248）。タグの並び順・名前・色・コミュニティ・隠す（アーカイブ）を1か所で決める。
 *
 * ★書き込みは /api/admin/tags（作成は POST、変更は PATCH）だけ★（監査ログ・レートリミットはそこに付いている）。
 * ★並び順は1つ★（Issue #248）組み込みのタグも作ったタグも1つの並びにし、この順が承認後の写真の優先順も兼ねる
 *   （上ほど優先。lib/welcome-config.ts の pickWelcome）。/admin/welcome では並べ替えない。
 *   並べ替えると、すべてのタグに 0 から order を振り直す（組み込みのタグは tags/{ID} の上書き用のドキュメントに入る）。
 * ★組み込みのタグも、名前・色・コミュニティを変えられ、隠せる★（Issue #248。config/tags.ts の applyTagDocs）
 *   隠せないタグ（all・couple・family。guest は一覧に出さない）は鍵マークと理由を出し、隠すボタンを出さない。
 * ★消さずに隠す（アーカイブ）★ タグの ID は Custom Claims と公開範囲（visibleToTags）に入っているので、
 *   物理削除すると権限と表示が壊れる。隠したタグはピッカー・コミュニティ・承認後の写真の一覧に出ないだけで、
 *   付いている人のタグと権限は残る。一覧の下の「隠したタグ」から戻せる。
 * ★ID・Claims・Rules・公開範囲は変えない★ 名前・色は、どの画面も ID からタグの辞書（lib/tags-client.ts の購読）を
 *   引いて出すので、保存すればすぐ反映される。コミュニティのタブも同じ辞書の community を見る。
 * ★仕組み用のタグ（system）は出さない★（Issue #204）。CTF のタグ（選べない組み込みタグ）も出さない（CTF 機能は保留中）。
 * 人数は guests の tags から数える（統合済み・アーカイブ済みの行は除く）。名簿だけの仮登録の行も含む。
 */

/** 一覧に出すタグか。仕組み用・選べない組み込み（CTF）は出さない */
function listed(t: TagDef): boolean {
  return t.system !== true && t.selectable !== false;
}

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

/** 編集のシートの対象。null は「新しいタグ」 */
type Editing = { tag: TagDef | null };

export default function AdminTagsPage() {
  const { user, isAdmin, loading: authLoading } = useGuestSession();
  const ordered = useOrderedTags();
  const orderState = useTagOrderState();
  const counts = useTagCounts(isAdmin);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const active = useMemo(() => ordered.filter((t) => listed(t) && !t.archived), [ordered]);
  const archived = useMemo(() => ordered.filter((t) => listed(t) && t.archived), [ordered]);

  /**
   * ★並び順がまだ一度も保存されていなければ、以前の承認後の写真の優先順を写す★（Issue #248。一度だけ）
   *   写したあとは辞書の購読で並び順が届く。失敗しても画面は使える（次に開いたときにまた試す）。
   */
  useEffect(() => {
    if (!isAdmin || orderState !== "unsaved") return;
    postJson("/api/admin/tags/migrate-order", {}).catch((e: unknown) => console.error("[admin/tags] 並び順の移行に失敗", e));
  }, [isAdmin, orderState]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  /** ほかのタグ（隠していないもの）と同じ名前か */
  function labelTaken(label: string, selfId: string | null): boolean {
    return ordered.some((t) => t.id !== selfId && !t.archived && t.label === label);
  }

  /**
   * ↑↓ で並び順を入れ替える。★すべてのタグに 0 から振り直す★（一覧の順 → 一覧に出ないタグ（隠した・仕組み用）の順）。
   *   変わったタグだけ送る。組み込みのタグの order は上書き用のドキュメントに入る。
   */
  async function move(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (busy || to < 0 || to >= active.length) return;
    const next = [...active];
    [next[index], next[to]] = [next[to], next[index]];
    const shown = new Set(next.map((t) => t.id));
    const all = [...next, ...ordered.filter((t) => !shown.has(t.id))];
    setBusy(true);
    try {
      for (let i = 0; i < all.length; i++) {
        if (all[i].order === i) continue;
        await patchJson("/api/admin/tags", { id: all[i].id, order: i });
        upsertCustomTag({ ...all[i], order: i });
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
      const order = ordered.reduce((m, x) => (typeof x.order === "number" ? Math.max(m, x.order + 1) : m), active.length);
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
            タグの並び順・名前・色・コミュニティを決めます。使わないタグは隠せます（付いている人のタグと権限は残ります）。
          </p>
        </header>

        {counts?.truncated && (
          <p role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ゲストが {ADMIN_GUESTS_LIMIT} 件を超えているため、人数は少なめに出ている可能性があります。
          </p>
        )}

        <section aria-labelledby="tags-list" className="mb-6">
          <div className="mb-2 flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <h2 id="tags-list" className="font-serif text-sm text-stone-800">タグ</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                この並び順は、
                <Link href="/admin/welcome" className="mx-0.5 font-medium text-stone-700 underline underline-offset-2">承認後の写真</Link>
                の優先順にも使います（上ほど優先）。
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing({ tag: null })}
              className={`${BTN} shrink-0 bg-stone-900 font-medium text-white hover:bg-stone-700 disabled:opacity-40`}
            >
              ＋ 新しいタグ
            </button>
          </div>
          <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200/80 bg-white shadow-sm">
            {active.map((t, i) => (
              <TagRow key={t.id} tag={t} count={counts ? (counts.byTag[t.id] ?? 0) : undefined}>
                <div className="flex shrink-0 items-center">
                  <button type="button" disabled={busy || i === 0} onClick={() => void move(i, -1)} aria-label={`${t.label} を上へ`} className={`${BTN} w-9 px-0 text-stone-500 disabled:opacity-30`}>↑</button>
                  <button type="button" disabled={busy || i === active.length - 1} onClick={() => void move(i, 1)} aria-label={`${t.label} を下へ`} className={`${BTN} w-9 px-0 text-stone-500 disabled:opacity-30`}>↓</button>
                  {canEditTag(t.id) && (
                    <button type="button" disabled={busy} onClick={() => setEditing({ tag: t })} className={`${BTN} border border-stone-200 text-stone-700 hover:bg-stone-100 disabled:opacity-40`}>編集</button>
                  )}
                </div>
              </TagRow>
            ))}
          </ul>
        </section>

        {archived.length > 0 && (
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer touch-manipulation list-none items-center gap-1 font-serif text-sm text-stone-800">
              <span className="text-stone-400 transition-transform group-open:rotate-90">▸</span>
              隠したタグ（{archived.length}）
            </summary>
            <p className="mb-2 text-xs text-stone-500">タグを選ぶ一覧・コミュニティ・承認後の写真には出ません。付いている人のタグと権限は残っています。</p>
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
          tag={editing.tag}
          labelTaken={(label) => labelTaken(label, editing.tag?.id ?? null)}
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
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-stone-500">
          <span className={tag.community ? "font-medium text-emerald-700" : ""}>コミュニティ {tag.community ? "オン" : "オフ"}</span>
          <span>
            <span className="font-serif tabular-nums">{count ?? "–"}</span> 人
          </span>
          {!tag.custom && <span>組み込み</span>}
        </p>
        {/* ★隠せないタグには鍵マークと理由★（Issue #248。隠すボタンは編集のシートにも出さない） */}
        {LOCKED_TAG_IDS.has(tag.id) && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-400">
            <LockIcon />
            隠せません（{LOCK_REASON[tag.id] ?? "アプリの動きに使っています"}）
          </p>
        )}
      </div>
      {children}
    </li>
  );
}

/** 隠せないタグの理由（Issue #248） */
const LOCK_REASON: Record<string, string> = {
  all: "全員に付き、公開範囲の「全員」に使っています",
  couple: "新郎新婦あての投稿に使っています",
  family: "親族用の招待状から承認すると付きます",
};

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 shrink-0 fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** パレットのキー（Firestore に保存した値）を、TagDef の className から引き戻す */
function paletteOf(tag: TagDef | null): string {
  if (!tag) return "stone";
  return PALETTE_KEYS.find((k) => TAG_PALETTES[k] === tag.className) ?? "stone";
}

/**
 * 編集のシート。tag が null なら「新しいタグ」（作成。POST）。保存は「保存」で1回の PATCH。一番下に隠す（アーカイブ）。
 * ★隠せないタグ（LOCKED_TAG_IDS）には隠すボタンを出さない★（Issue #248）
 * ★入力欄の文字は 16px 以上★ iOS は 16px 未満の入力欄にフォーカスすると画面を拡大する（TagPicker と同じ。Issue #126）。
 * ★シートは見えている範囲に合わせる★（useVisualViewportFrame）キーボードが開いても、保存ボタンが隠れない。
 */
function EditSheet({
  tag,
  labelTaken,
  onClose,
  onSaved,
}: {
  tag: TagDef | null;
  labelTaken: (label: string) => boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const creating = tag === null;
  const [label, setLabel] = useState(tag?.label ?? "");
  const [palette, setPalette] = useState(() => paletteOf(tag));
  const [community, setCommunity] = useState(tag?.community === true);
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
  const changed = creating ? trimmed.length > 0 : trimmed !== tag.label || palette !== paletteOf(tag) || community !== (tag.community === true);

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
      if (tag === null) {
        // ★作成は今の POST★（Issue #248）作ったタグは並び順の最後に入る（API が order を決める）
        const r = await postJson<{ tag: { id: string } & CustomTagDoc }>("/api/admin/tags", { label: trimmed, palette, community });
        upsertCustomTag(toTagDef(r.tag.id, r.tag));
        refreshTagCache();
        onSaved(`「${trimmed}」を作りました`);
        return;
      }
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
    if (busy || tag === null) return;
    if (!confirm(`「${tag.label}」を隠します。\nタグを選ぶ一覧・コミュニティ・承認後の写真に出なくなります。付いている人のタグや権限は残ります。`)) return;
    setBusy(true);
    setErr("");
    try {
      await patchJson("/api/admin/tags", { id: tag.id, archived: true });
      upsertCustomTag({ ...tag, archived: true });
      refreshTagCache();
      onSaved(`「${tag.label}」を隠しました`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "隠せませんでした");
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
          <p id="tag-edit-title" className="font-serif text-base text-stone-900">{creating ? "新しいタグ" : "タグを編集"}</p>
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
                {trimmed || tag?.label || "タグ名"}
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
            {busy ? (creating ? "作成中…" : "保存中…") : creating ? "作成" : "保存"}
          </button>

          {tag && canHideTag(tag.id) && (
          <div className="border-t border-stone-100 pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void archive()}
              className="min-h-11 w-full touch-manipulation rounded-full border border-rose-200 px-4 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-40"
            >
              隠す
            </button>
            <p className="mt-1.5 text-center text-[11px] leading-relaxed text-stone-400">
              タグを選ぶ一覧・コミュニティ・承認後の写真に出なくなります。付いている人のタグや権限は残ります
            </p>
          </div>
          )}
          {tag && !canHideTag(tag.id) && (
            <p className="flex items-center justify-center gap-1 border-t border-stone-100 pt-4 text-center text-[11px] leading-relaxed text-stone-400">
              <LockIcon />
              このタグはアプリの動きに使っているため、隠せません
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
