"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson, putJson } from "@/lib/api-client";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useTags } from "@/lib/tags-client";
import { thumbSrc } from "@/lib/media-url";
import { MAX_MESSAGE, pickWelcome, type WelcomeConfig } from "@/lib/welcome-config";
import { DEFAULT_GUEST_TAGS, tagDef, type TagDef } from "@/config/tags";
import { WELCOME_DEFAULT_MESSAGE, WELCOME_PLACEHOLDER_IMAGE } from "@/config/welcome";
import { WelcomePostPicker } from "@/components/admin/WelcomePostPicker";
import type { AdminWelcomeStatus, WelcomePostOption } from "@/types/welcome";

/** 写真を選ぶ先。null は「全員（グループのタグがない人）」 */
type Target = { tag: string | null };

/**
 * 公開範囲の確認。★guest は承認済みの全員に付く★ので、all と同じく誰にでも見える範囲として扱う。
 * tag が null（全員用）なら、all か guest が入っていれば見える。
 */
function warnFor(post: WelcomePostOption, tag: string | null): string | null {
  if (post.status === "hidden") return "非表示の投稿です";
  const v = new Set(post.visibleToTags);
  const everyone = DEFAULT_GUEST_TAGS.some((t) => v.has(t));
  if (everyone) return null;
  if (tag === null) return "全員には見えない投稿です";
  return v.has(tag) ? null : "このタグの人には見えない投稿です";
}

/** 「確かめる」: その人に見える投稿か（/api/guest/welcome と同じ条件） */
function visibleTo(post: WelcomePostOption, tags: readonly string[]): boolean {
  return post.status === "visible" && post.visibleToTags.some((t) => tags.includes(t));
}

/** 管理画面で並べるタグ。★コミュニティに使う組み込みタグ＋カスタムタグ（アーカイブを除く）★（Issue #215） */
function welcomeTags(all: TagDef[]): TagDef[] {
  return all.filter((t) => !t.archived && (t.community === true || t.custom === true));
}

export default function AdminWelcomePage() {
  const { user, isAdmin, loading: authLoading } = useGuestSession();
  const { allTags } = useTags();

  const [draft, setDraft] = useState<WelcomeConfig | null>(null);
  const [posts, setPosts] = useState<WelcomePostOption[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [broken, setBroken] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState<Target | null>(null);
  const [checkTags, setCheckTags] = useState<string[]>([]);

  /** 応答を画面に入れる。keepDraft: 写真の一覧だけを入れ替える（編集中の設定は残す） */
  const apply = useCallback((r: AdminWelcomeStatus, keepDraft: boolean) => {
    setPosts(r.posts);
    setMissing(r.missing);
    if (!keepDraft) {
      setDraft(r.config);
      setBroken(r.broken);
      setDirty(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    getJson<AdminWelcomeStatus>("/api/admin/welcome")
      .then((r) => { if (alive) apply(r, false); })
      .catch((e) => { if (alive) setLoadError(e instanceof Error ? e.message : "読み込みに失敗しました"); });
    return () => { alive = false; };
  }, [isAdmin, apply]);

  const reloadPosts = useCallback(async () => {
    setReloading(true);
    try {
      apply(await getJson<AdminWelcomeStatus>("/api/admin/welcome"), true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setReloading(false);
    }
  }, [apply]);

  const tags = useMemo(() => welcomeTags(allTags), [allTags]);
  const tagSet = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);
  const postById = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);

  /** 優先順に並べたタグの行。priority にあるもの → まだ無いもの（タグの並び順） */
  const rows = useMemo(() => {
    if (!draft) return [];
    const ranked = draft.priority.filter((t) => tagSet.has(t));
    const rankedSet = new Set(ranked);
    return [...ranked, ...tags.map((t) => t.id).filter((t) => !rankedSet.has(t))];
  }, [draft, tags, tagSet]);

  const update = useCallback((fn: (c: WelcomeConfig) => WelcomeConfig) => {
    setDraft((c) => (c ? fn(c) : c));
    setDirty(true);
    setSaved(false);
  }, []);

  /**
   * 行を入れ替える。★画面に出ないタグ（アーカイブ済みなど）の priority は、後ろにそのまま残す★
   * 並べ替えたら、画面の行の順をそのまま priority にする（まだ priority に無い行も、見えている順で入る）。
   */
  const move = useCallback((index: number, delta: -1 | 1) => {
    const j = index + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[index], next[j]] = [next[j], next[index]];
    update((c) => ({ ...c, priority: [...next, ...c.priority.filter((t) => !tagSet.has(t))] }));
  }, [rows, tagSet, update]);

  const setPost = useCallback((target: Target, postId: string) => {
    update((c) => {
      if (target.tag === null) return { ...c, defaultPostId: postId };
      const byTag = { ...c.byTag };
      if (postId) byTag[target.tag] = postId;
      else delete byTag[target.tag];
      return { ...c, byTag };
    });
  }, [update]);

  const setMessage = useCallback((tag: string | null, value: string) => {
    update((c) => {
      if (tag === null) return { ...c, message: value };
      const messages = { ...c.messages };
      if (value.trim()) messages[tag] = value;
      else delete messages[tag];
      return { ...c, messages };
    });
  }, [update]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      // ★保存するときの priority は、画面の行の順＋画面に出ないタグの順★（並べ替えていなくても、見えている順を保存する）
      const priority = [...rows, ...draft.priority.filter((t) => !tagSet.has(t))];
      const body: WelcomeConfig = { ...draft, priority };
      await putJson("/api/admin/welcome", body);
      setDraft(body);
      setDirty(false);
      setSaved(true);
      setBroken(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [draft, rows, tagSet]);

  // 「確かめる」: 選んだタグ＋全員に付くタグで、ゲストと同じ関数（pickWelcome）を呼ぶ
  const preview = useMemo(() => {
    if (!draft) return null;
    const guestTags = [...checkTags, ...DEFAULT_GUEST_TAGS];
    const pick = pickWelcome({ ...draft, priority: [...rows, ...draft.priority.filter((t) => !tagSet.has(t))] }, guestTags);
    const post = pick.postId ? postById.get(pick.postId) ?? null : null;
    const shown = post && visibleTo(post, guestTags) ? post : null;
    return { pick, post, shown, message: pick.message || WELCOME_DEFAULT_MESSAGE };
  }, [draft, checkTags, rows, tagSet, postById]);

  if (authLoading) return <main className="min-h-screen bg-stone-50 p-8"><div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" /></main>;
  if (!user || !isAdmin) return <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8"><div className="max-w-sm rounded-2xl border border-stone-200 bg-white p-8 text-center"><p className="font-medium text-stone-800">管理者専用ページです</p></div></main>;

  const pickingCurrent = picking && draft ? (picking.tag === null ? draft.defaultPostId : draft.byTag[picking.tag] ?? "") : "";

  return (
    <main className="selectable min-h-screen bg-stone-50" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
      <div className="mx-auto max-w-2xl px-4 py-4 md:py-8">
        <header className="mb-5">
          <Link href="/admin" className="inline-flex min-h-11 touch-manipulation items-center text-xs text-stone-500 hover:text-stone-800">← ゲスト管理</Link>
          <h1 className="font-serif text-xl text-stone-900">承認後の写真</h1>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            承認されたゲストに最初に届く写真と一言を決めます。タグが重なっている人には、下の「タグごと」で上にあるタグの写真が届きます。
          </p>
        </header>

        {loadError && <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{loadError}</div>}
        {broken && (
          <div role="alert" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            今の設定の形が違うため、読み込めませんでした（項目: {broken}）。保存すると、この画面の内容で置き換わります。
          </div>
        )}
        {missing.length > 0 && (
          <div role="alert" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            見つからない投稿（または写真のない投稿）が {missing.length} 件設定されています。選び直してから保存してください。
          </div>
        )}

        {!draft ? (
          !loadError && <div className="h-64 animate-pulse rounded-2xl bg-stone-200/60" />
        ) : (
          <div className="space-y-6">
            {/* 1. 全員 */}
            <section className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
              <h2 className="font-serif text-base text-stone-900">全員</h2>
              <p className="mt-0.5 text-xs text-stone-500">グループのタグがない人と、写真が未設定のタグの人に届きます。</p>
              <div className="mt-3">
                <TargetRow
                  label={null}
                  post={draft.defaultPostId ? postById.get(draft.defaultPostId) ?? null : null}
                  postId={draft.defaultPostId}
                  warn={(p) => warnFor(p, null)}
                  emptyText="未設定 → 仮の画像"
                  message={draft.message}
                  messagePlaceholder={WELCOME_DEFAULT_MESSAGE}
                  onMessage={(v) => setMessage(null, v)}
                  onPick={() => setPicking({ tag: null })}
                />
              </div>
            </section>

            {/* 2. タグごと */}
            <section className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
              <h2 className="font-serif text-base text-stone-900">タグごと</h2>
              <p className="mt-0.5 text-xs text-stone-500">上ほど優先します。↑↓で並べ替えられます。</p>
              <ol className="mt-3 divide-y divide-stone-100">
                {rows.map((id, i) => {
                  const def = tagDef(id);
                  const postId = draft.byTag[id] ?? "";
                  return (
                    <li key={id} className="py-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="w-5 text-center font-serif text-sm tabular-nums text-stone-400">{i + 1}</span>
                        <span className={`rounded-full px-2 py-0.5 font-serif text-sm ring-1 ${def.className}`}>{def.label}</span>
                        <span className="ml-auto flex gap-1">
                          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${def.label}を上へ`} className="min-h-11 min-w-11 touch-manipulation rounded-full border border-stone-200 text-stone-600 hover:bg-stone-100 disabled:opacity-30">↑</button>
                          <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`${def.label}を下へ`} className="min-h-11 min-w-11 touch-manipulation rounded-full border border-stone-200 text-stone-600 hover:bg-stone-100 disabled:opacity-30">↓</button>
                        </span>
                      </div>
                      <TargetRow
                        label={def.label}
                        post={postId ? postById.get(postId) ?? null : null}
                        postId={postId}
                        warn={(p) => warnFor(p, id)}
                        emptyText="未設定 → 全員の写真"
                        message={draft.messages[id] ?? ""}
                        messagePlaceholder="未設定 → 全員の一言"
                        onMessage={(v) => setMessage(id, v)}
                        onPick={() => setPicking({ tag: id })}
                      />
                    </li>
                  );
                })}
              </ol>
              {rows.length === 0 && <p className="py-4 text-center text-xs text-stone-400">コミュニティに使うタグがありません。</p>}
            </section>

            {/* 3. 確かめる */}
            <section className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
              <h2 className="font-serif text-base text-stone-900">確かめる</h2>
              <p className="mt-0.5 text-xs text-stone-500">タグを選ぶと、その人に届く写真と一言を表示します（保存前の内容で確かめられます）。</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const on = checkTags.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCheckTags((s) => (on ? s.filter((x) => x !== t.id) : [...s, t.id]))}
                      className={`min-h-11 touch-manipulation rounded-full px-3 text-xs ring-1 ${on ? t.className : "bg-white text-stone-400 ring-stone-200"}`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {preview && (
                <div className="mt-3 flex gap-3 rounded-xl bg-stone-50 p-3">
                  <span className="relative block size-24 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                    <Image src={preview.shown ? thumbSrc(preview.shown.media) : WELCOME_PLACEHOLDER_IMAGE} alt="" fill sizes="96px" className="object-cover" unoptimized />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-serif text-stone-900">{preview.message}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {preview.pick.tag ? `「${tagDef(preview.pick.tag).label}」の写真` : preview.pick.postId ? "全員の写真" : "写真が未設定のため、仮の画像"}
                    </p>
                    {preview.pick.postId && !preview.shown && (
                      <p className="mt-1 text-xs text-amber-700">この人には見えない投稿のため、仮の画像が届きます。</p>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* 保存（まとめて1回） */}
      {draft && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-stone-500" role={saveError ? "alert" : undefined}>
              {saveError ? (
                <span className="text-rose-600">{saveError}</span>
              ) : saved ? (
                <span className="text-emerald-700">保存しました。<Link href="/admin/invitation_test" className="underline">招待状テスト</Link>で確かめられます。</span>
              ) : dirty ? (
                "保存していない変更があります"
              ) : (
                "変更はありません"
              )}
            </p>
            <button type="button" onClick={() => void save()} disabled={saving || (!dirty && !broken)} className="min-h-11 touch-manipulation rounded-full bg-stone-900 px-6 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40">
              {saving ? "保存しています…" : "保存"}
            </button>
          </div>
        </div>
      )}

      {picking && (
        <WelcomePostPicker
          title={picking.tag === null ? "全員の写真を選ぶ" : `「${tagDef(picking.tag).label}」の写真を選ぶ`}
          posts={posts}
          current={pickingCurrent}
          warnOf={(p) => warnFor(p, picking.tag)}
          onPick={(id) => {
            setPost(picking, id);
            setPicking(null);
          }}
          onReload={() => void reloadPosts()}
          reloading={reloading}
          onClose={() => setPicking(null)}
        />
      )}
    </main>
  );
}

/** 写真のサムネイル・一言・警告の1行 */
function TargetRow({
  label,
  post,
  postId,
  warn,
  emptyText,
  message,
  messagePlaceholder,
  onMessage,
  onPick,
}: {
  label: string | null;
  post: WelcomePostOption | null;
  postId: string;
  warn: (p: WelcomePostOption) => string | null;
  emptyText: string;
  message: string;
  messagePlaceholder: string;
  onMessage: (v: string) => void;
  onPick: () => void;
}) {
  const warning = post ? warn(post) : postId ? "見つからない投稿です。選び直してください" : null;
  return (
    <div className="flex gap-3">
      <button type="button" onClick={onPick} aria-label={label ? `${label}の写真を選ぶ` : "全員の写真を選ぶ"} className="relative block size-20 shrink-0 touch-manipulation overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
        {post ? (
          <Image src={thumbSrc(post.media)} alt="" fill sizes="80px" className="object-cover" unoptimized />
        ) : (
          <span className="flex h-full items-center justify-center px-1 text-center text-[10px] leading-tight text-stone-400">{emptyText}</span>
        )}
      </button>
      <div className="min-w-0 flex-1 space-y-1.5">
        <input
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          maxLength={MAX_MESSAGE}
          placeholder={messagePlaceholder}
          aria-label={label ? `${label}の一言` : "全員の一言"}
          className="min-h-11 w-full rounded-lg border border-stone-200 px-3 text-base outline-none placeholder:text-stone-300 focus:border-stone-400 md:text-sm"
        />
        <button type="button" onClick={onPick} className="min-h-11 touch-manipulation rounded-full border border-stone-200 px-3 text-xs text-stone-600 hover:bg-stone-100">写真を選ぶ</button>
        {warning && <p className="text-xs text-amber-700">{warning}</p>}
      </div>
    </div>
  );
}
