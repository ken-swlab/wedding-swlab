"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { useGuestSession } from "@/hooks/useGuestSession";
import { GuestSessionProvider } from "@/components/guestbook/GuestSessionContext";
import { AuthorNameProvider } from "@/components/guestbook/AuthorNameProvider";
import { InvitationView } from "@/components/guestbook/InvitationView";
import { PostCard } from "@/components/guestbook/PostCard";
import { Composer } from "@/components/guestbook/Composer";
import { HeartIcon } from "@/components/guestbook/HeartIcon";
import {
  CHROMA_MAX,
  CHROMA_STEP,
  SHADES,
  THEME_CANDIDATES,
  THEME_PREVIEW_PARAM,
  THEME_ROLES,
  encodeTuning,
  exportTheme,
  roleScale,
  type Oklch,
  type ThemeRole,
  type ThemeTuning,
} from "@/config/theme";
import { WHITE, contrastRatio, readStoredPreview, storePreview, tuningStyle } from "@/lib/theme-preview";
import { GUESTBOOK_PATHS } from "@/config/guestbook";
import type { InvitationContent } from "@/types/invitation";
import type { Post } from "@/types";

const ROLE_LABEL: Record<ThemeRole, { name: string; note: string }> = {
  base: { name: "ベース", note: "背景・文字・枠" },
  accent: { name: "アクセント", note: "差し色（いいねのハート・いいね済みのボタン・思い出エピソードの枠）" },
  sub: { name: "サブ", note: "2色目（まだ画面では使っていません）" },
  pop: { name: "ポップ", note: "3色目（まだ画面では使っていません）" },
};

/** WCAG の本文の基準 */
const CONTRAST_MIN = 4.5;

/** ★本物の名前・会場を使わない★（招待状テストと同じ。本物はサーバーだけが持つ） */
const SAMPLE_INVITATION: InvitationContent = {
  groom: "新郎 太郎",
  bride: "新婦 花子",
  dateLabel: "20XX年X月X日（土）",
  receptionAt: "受付 XX:XX ／ 披露宴 XX:XX",
  venueName: "（ダミー）会場名",
  venueAddress: "（ダミー）住所",
  venueMapUrl: "",
  greeting: ["（ダミー）ご挨拶の一行目です。", "（ダミー）ご挨拶の二行目です。"],
};

function shadeOf(t: ThemeTuning, role: ThemeRole, shade: (typeof SHADES)[number]): Oklch {
  return roleScale(role, t[role])[SHADES.indexOf(shade)];
}

/**
 * デザイン検討ページ（Issue #130）。4つの案とスライダーで配色を試し、この端末でアプリ全体を見る。
 *
 * ★書き込み API を呼ばない★ 配色は端末の localStorage と URL にしか置かない。本番のゲストの表示は変わらない。
 *   本番に反映するのは、書き出した設定を config/theme.ts に貼って push したとき。
 * ★見本は実際の部品を使い、操作は止める（inert）★ 投稿・いいね・画面の移動が本当に起きないようにする。
 */
export default function AdminDesignPage() {
  const session = useGuestSession();
  const { user, isAdmin, loading: authLoading } = session;

  // 前回この端末でプレビューした配色があれば、そこから始める
  const [tuning, setTuning] = useState<ThemeTuning>(() => (typeof window === "undefined" ? null : readStoredPreview()) ?? THEME_CANDIDATES[0]);
  const [candidateId, setCandidateId] = useState<string>(() => (typeof window !== "undefined" && readStoredPreview() ? "" : THEME_CANDIDATES[0].id));
  const [message, setMessage] = useState<string | null>(null);
  const candidate = THEME_CANDIDATES.find((c) => c.id === candidateId) ?? null;

  const samplePost = useMemo<Post | null>(
    () =>
      user
        ? {
            id: "design-sample",
            authorUid: user.uid,
            authorName: "（見本）ゲスト",
            text: "（見本の投稿）式場に着きました。いいお天気です。 #見本",
            media: [],
            visibleToTags: ["all", "friends_groom"],
            hashtags: ["見本"],
            mentions: [],
            mentionUids: [],
            status: "visible",
            reactionCount: 3,
            commentCount: 2,
            // 見本なので時刻は固定（「10/9 18:25」の形で出る）
            createdAt: Timestamp.fromDate(new Date(2026, 9, 9, 18, 25)),
          }
        : null,
    [user],
  );

  const checks = useMemo(() => {
    const pairs: { label: string; fg: Oklch; bg: Oklch }[] = [
      { label: "本文の文字 × 画面の背景", fg: shadeOf(tuning, "base", 800), bg: shadeOf(tuning, "base", 50) },
      { label: "本文の文字 × カード（白）", fg: shadeOf(tuning, "base", 800), bg: WHITE },
      { label: "補足の文字 × カード（白）", fg: shadeOf(tuning, "base", 500), bg: WHITE },
      { label: "ボタンの文字（白）× ボタン", fg: WHITE, bg: shadeOf(tuning, "base", 900) },
      { label: "アクセントの文字 × アクセントの淡い背景", fg: shadeOf(tuning, "accent", 600), bg: shadeOf(tuning, "accent", 50) },
    ];
    return pairs.map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }));
  }, [tuning]);
  const lowContrast = checks.filter((c) => c.ratio < CONTRAST_MIN);

  const exported = useMemo(() => exportTheme(candidate?.id ?? "custom", candidate?.label ?? "カスタム", tuning), [candidate, tuning]);

  function pick(id: string) {
    const c = THEME_CANDIDATES.find((x) => x.id === id);
    if (!c) return;
    setCandidateId(id);
    setTuning({ base: c.base, accent: c.accent, sub: c.sub, pop: c.pop });
    setMessage(null);
  }

  function slide(role: ThemeRole, key: "hue" | "chroma", value: number) {
    setTuning((t) => ({ ...t, [role]: { ...t[role], [key]: value } }));
  }

  function previewLink(): string {
    return `${window.location.origin}${GUESTBOOK_PATHS.home}?${THEME_PREVIEW_PARAM}=${encodeTuning(tuning)}`;
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(done);
    } catch {
      setMessage("コピーできませんでした。下の欄を長押しして、手でコピーしてください。");
    }
  }

  function startPreview() {
    const saved = storePreview(tuning);
    setMessage(
      saved
        ? "この端末だけ、アプリ全体をこの配色にしました。画面上部の「解除」で元に戻ります。"
        : "この端末では保存できませんでした（プライベートブラウズなど）。プレビューは使えません。",
    );
  }

  if (authLoading) return <main className="min-h-screen bg-stone-50 p-8"><div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" /></main>;
  if (!user || !isAdmin) return <main className="flex min-h-screen items-center justify-center bg-stone-50 p-8"><p className="text-sm text-stone-600">管理者専用ページです</p></main>;

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-xl space-y-6 px-4 pb-16 pt-10">
        <header>
          <Link href="/admin" className="-my-3 inline-block py-3 text-xs text-stone-400 hover:text-stone-700">← ゲスト管理に戻る</Link>
          <h1 className="mt-2 font-serif text-xl text-stone-900">デザイン検討</h1>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            配色を試すページです。ここでの操作はこの端末の中だけで、ゲストの画面は変わりません。
            決めた配色は、下の「本番用に書き出す」を config/theme.ts に貼ると反映されます。
          </p>
        </header>

        {/* ---- 1. 案を選ぶ ---- */}
        <section aria-labelledby="design-candidates">
          <h2 id="design-candidates" className="text-sm font-semibold text-stone-800">1. 案を選ぶ</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {THEME_CANDIDATES.map((c) => {
              const on = c.id === candidateId;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(c.id)}
                  className={`min-h-11 touch-manipulation rounded-2xl border bg-white p-3 text-left transition ${on ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-200/80"}`}
                >
                  <span className="flex gap-1">
                    {THEME_ROLES.map((r) => (
                      <span key={r} aria-hidden className="h-5 flex-1 rounded" style={{ backgroundColor: toCss(roleScale(r, c[r])[r === "base" ? 2 : 5]) }} />
                    ))}
                  </span>
                  <span className="mt-2 block text-sm font-medium text-stone-900">{c.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-stone-500">{c.note}</span>
                </button>
              );
            })}
          </div>
          {!candidate && <p className="mt-2 text-xs text-stone-500">前回この端末でプレビューした配色から始めています。</p>}
        </section>

        {/* ---- 2. 調整する ---- */}
        <section aria-labelledby="design-sliders">
          <h2 id="design-sliders" className="text-sm font-semibold text-stone-800">2. 色を調整する</h2>
          <div className="mt-2 space-y-3">
            {THEME_ROLES.map((role) => (
              <div key={role} className="rounded-2xl border border-stone-200/80 bg-white p-3">
                <p className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-stone-900">{ROLE_LABEL[role].name}</span>
                  <span className="text-[11px] text-stone-500">{ROLE_LABEL[role].note}</span>
                </p>
                <div aria-hidden className="mt-2 flex overflow-hidden rounded-lg">
                  {roleScale(role, tuning[role]).map((c, i) => (
                    <span key={SHADES[i]} className="h-6 flex-1" style={{ backgroundColor: toCss(c) }} />
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-3 text-xs text-stone-600">
                  <span className="w-14 shrink-0">色相</span>
                  <input type="range" min={0} max={360} step={1} value={tuning[role].hue} onChange={(e) => slide(role, "hue", Number(e.target.value))} className="h-11 min-w-0 flex-1 touch-manipulation accent-stone-900" />
                  <output className="w-12 shrink-0 text-right tabular-nums text-stone-900">{tuning[role].hue}</output>
                </label>
                <label className="flex items-center gap-3 text-xs text-stone-600">
                  <span className="w-14 shrink-0">鮮やかさ</span>
                  <input type="range" min={0} max={CHROMA_MAX[role]} step={CHROMA_STEP} value={tuning[role].chroma} onChange={(e) => slide(role, "chroma", Number(e.target.value))} className="h-11 min-w-0 flex-1 touch-manipulation accent-stone-900" />
                  <output className="w-12 shrink-0 text-right tabular-nums text-stone-900">{tuning[role].chroma.toFixed(3)}</output>
                </label>
              </div>
            ))}
          </div>
        </section>

        {/* ---- 3. コントラスト ---- */}
        <section aria-labelledby="design-contrast">
          <h2 id="design-contrast" className="text-sm font-semibold text-stone-800">3. 読みやすさ（コントラスト比）</h2>
          {lowContrast.length > 0 && (
            <p role="alert" className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              {CONTRAST_MIN} に届かない組み合わせが {lowContrast.length} つあります。小さい文字が読みにくくなります（プレビューと書き出しはできます）。
            </p>
          )}
          <ul className="mt-2 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/80 bg-white">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span aria-hidden className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md border border-stone-200 text-sm font-medium" style={{ color: toCss(c.fg), backgroundColor: toCss(c.bg) }}>あ</span>
                <span className="min-w-0 flex-1 text-stone-700">{c.label}</span>
                <span className={`shrink-0 tabular-nums font-medium ${c.ratio < CONTRAST_MIN ? "text-amber-700" : "text-emerald-700"}`}>
                  {c.ratio.toFixed(2)}
                  <span className="ml-1">{c.ratio < CONTRAST_MIN ? "不足" : "OK"}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- 4. 見本 ---- */}
        <section aria-labelledby="design-samples">
          <h2 id="design-samples" className="text-sm font-semibold text-stone-800">4. 見本</h2>
          <p className="mt-1 text-[11px] text-stone-500">実際の画面の部品です（押しても動きません）。タグの色と、エラー・未送信などの色は、どの配色でも変わりません。</p>
          {/* ★この枠の中だけ配色を差し替える★ 変数を枠の style に付けると、中の stone / accent のクラスがそれに従う */}
          <div style={tuningStyle(tuning)} inert className="mt-2 space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-3">
            <GuestSessionProvider value={session}>
              <AuthorNameProvider value="（見本）ゲスト">
                <div className="max-h-64 overflow-hidden rounded-2xl bg-stone-50 px-4 pb-4">
                  <InvitationView invitation={SAMPLE_INVITATION} />
                </div>
                {samplePost && <PostCard post={samplePost} user={user} openAs="page" />}
                <Composer user={user} tags={session.tags} onUploadOriginals={() => {}} />
                <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
                  <p className="text-xs leading-relaxed text-stone-500">
                    アクセントが出るのは、いいねのハート・いいね済みのボタン・思い出エピソードの枠（上の投稿画面でチェックを入れると出ます）です。主なボタンはベースの色です。
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-3 py-1.5 text-sm text-accent-600"><HeartIcon filled />4</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-stone-500"><HeartIcon filled={false} />3</span>
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-stone-700 px-2 py-1 text-[11px] font-medium text-white"><HeartIcon filled className="h-3 w-3" />12</span>
                    <span className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white">投稿する</span>
                  </div>
                  <p className="mt-3 text-xs text-stone-500">サブ・ポップ（まだ画面では使っていません）</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-sub-600 px-4 py-2 text-sm font-medium text-white">サブ</span>
                    <span className="rounded-full bg-pop-400 px-4 py-2 text-sm font-medium text-stone-900">ポップ</span>
                  </div>
                </div>
              </AuthorNameProvider>
            </GuestSessionProvider>
          </div>
        </section>

        {/* ---- 5. アプリ全体で見る・共有する ---- */}
        <section aria-labelledby="design-preview" className="space-y-2">
          <h2 id="design-preview" className="text-sm font-semibold text-stone-800">5. アプリ全体で見る</h2>
          <button type="button" onClick={startPreview} className="min-h-11 w-full touch-manipulation rounded-full bg-stone-900 px-4 text-sm font-medium text-white transition hover:bg-stone-700">
            この配色でアプリ全体を見る（この端末だけ）
          </button>
          <div className="grid grid-cols-2 gap-2">
            <Link href={GUESTBOOK_PATHS.home} className="flex min-h-11 touch-manipulation items-center justify-center rounded-full border border-stone-200 bg-white px-3 text-sm text-stone-600">ゲストブックを開く</Link>
            <button type="button" onClick={() => void copy(previewLink(), "プレビューのリンクをコピーしました。もう一人の管理者の端末で開くと、同じ配色になります。")} className="min-h-11 touch-manipulation rounded-full border border-stone-200 bg-white px-3 text-sm text-stone-600">
              プレビューのリンクをコピー
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-stone-500">リンクが効くのは管理者だけです。ゲストが開いても、配色は変わりません。</p>
          {message && <p role="status" className="rounded-xl bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900">{message}</p>}
        </section>

        {/* ---- 6. 書き出す ---- */}
        <section aria-labelledby="design-export" className="space-y-2">
          <h2 id="design-export" className="text-sm font-semibold text-stone-800">6. 本番用に書き出す</h2>
          <p className="text-[11px] leading-relaxed text-stone-500">app/web/src/config/theme.ts の「export const ACTIVE_THEME …」の行を、これで置き換えて push します。</p>
          <textarea readOnly value={exported} rows={8} aria-label="本番用の設定" className="selectable w-full rounded-xl border border-stone-200 bg-white p-3 font-mono text-base leading-snug text-stone-800" />
          <button type="button" onClick={() => void copy(exported, "設定をコピーしました。")} className="min-h-11 w-full touch-manipulation rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-600">
            設定をコピー
          </button>
        </section>
      </div>
    </main>
  );
}

/** 見本の色（見出しの色見本・コントラストの「あ」）。配色そのものを見せるので、テーマの変数ではなく値を直接付ける */
function toCss([l, c, h]: Oklch): string {
  return `oklch(${l} ${c} ${h})`;
}
