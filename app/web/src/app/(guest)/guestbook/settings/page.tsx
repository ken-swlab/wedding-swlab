"use client";

import Image from "next/image";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { GuestbookShell } from "@/components/guestbook/GuestbookShell";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { PostCard } from "@/components/guestbook/PostCard";
import { TagBadge } from "@/components/guestbook/TagBadge";
import { useMyPosts } from "@/hooks/useMyPosts";
import { postJson } from "@/lib/api-client";
import { compressForIcon } from "@/lib/image";
import { uploadThumb } from "@/lib/media";
import { publicName } from "@/lib/names";
import { countChars } from "@/lib/text";
import { PROFILE_BIO_MAX, PROFILE_NICKNAME_MAX } from "@/config/profile";

const PROFILE_API = "/api/guest/profile";

/**
 * マイページ。自分のプロフィールと自分の投稿を見直し、ほかのゲストからどう見えているかを確かめる（Issue #87）。
 * ふだんは表示だけで、「編集」を押したときだけニックネーム・ひとことの入力欄に切り替わる。
 *
 * ★書き込みは /api/guest/profile だけ★ guests への本人の直接の書き込みは Rules で閉じている。
 *   保存した値は useGuestSession の guests の購読で戻ってくるので、ここで手元の表示を書き換えない。
 * ★アイコンは選んだらすぐ保存する★ 画像を送ってから「保存」を押し忘れると、
 *   使われない画像だけが公開バケットに残る。
 * ★タグは読み取り専用★ 付けるのは管理者（新郎新婦）。
 * ★新郎新婦が非表示にした自分の投稿は、その位置に「非表示にしました。」の1行だけを出す★
 *   本文・写真・日時・理由は出さず、開けもしない。非表示のコメントの一覧はどこにも出さない。
 */
export default function SettingsPage() {
  const { user, profile, tags } = useGuestSessionContext();
  const savedNickname = profile?.nickname ?? "";
  const savedBio = profile?.bio ?? "";

  const [nickname, setNickname] = useState(savedNickname);
  const [bio, setBio] = useState(savedBio);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [iconBusy, setIconBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mine = useMyPosts(user?.uid ?? null);

  const nicknameCount = countChars(nickname.trim());
  const bioCount = countChars(bio.trim());
  const nicknameOk = nicknameCount >= 1 && nicknameCount <= PROFILE_NICKNAME_MAX;
  const bioOk = bioCount <= PROFILE_BIO_MAX;
  const changed = nickname.trim() !== savedNickname || bio.trim() !== savedBio;
  const canSave = changed && nicknameOk && bioOk && !saving;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await postJson(PROFILE_API, { nickname: nickname.trim(), bio: bio.trim() });
      setEditing(false);
      setMessage("保存しました");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  }

  function onEdit() {
    // 入力欄は保存済みの値から始める（前にキャンセルした書きかけを残さない）
    setNickname(savedNickname);
    setBio(savedBio);
    setMessage(null);
    setError(null);
    setEditing(true);
  }

  function onCancel() {
    setEditing(false);
    setError(null);
  }

  async function onPickIcon(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 同じ写真をもう一度選んでも change が来るように空にしておく
    e.target.value = "";
    if (!file) return;
    setIconBusy(true);
    setMessage(null);
    setError(null);
    try {
      const blob = await compressForIcon(file);
      const { key } = await uploadThumb(blob);
      await postJson(PROFILE_API, { iconKey: key });
      setMessage("アイコンを変更しました");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "アイコンを変更できませんでした");
    } finally {
      setIconBusy(false);
    }
  }

  async function onUseLineIcon() {
    setIconBusy(true);
    setMessage(null);
    setError(null);
    try {
      await postJson(PROFILE_API, { iconSource: "line" });
      setMessage("LINE のアイコンに戻しました");
    } catch (err) {
      setError(err instanceof Error ? err.message : "アイコンを変更できませんでした");
    } finally {
      setIconBusy(false);
    }
  }

  const photoURL = profile?.photoURL || user?.photoURL || "";

  return (
    <GuestbookShell>
      <section aria-label="プロフィール">
        <div className="flex items-start gap-4">
          {/* アイコンを押すと端末の写真の選択が開く（写真ライブラリ・写真を撮る・ファイル） */}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={iconBusy}
            aria-label="アイコンの写真を選ぶ"
            className="relative h-20 w-20 shrink-0 touch-manipulation overflow-hidden rounded-full bg-stone-200 disabled:opacity-60"
          >
            {photoURL && <Image src={photoURL} alt="" fill sizes="80px" className="object-cover" />}
            {iconBusy && (
              <span className="absolute inset-0 flex items-center justify-center bg-white/60" role="status">
                <span
                  aria-hidden
                  className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700"
                />
                <span className="sr-only">アイコンを変更しています</span>
              </span>
            )}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={(e) => void onPickIcon(e)}
            className="hidden"
          />
          {!editing && (
            <div className="flex min-h-20 min-w-0 flex-1 items-center gap-2">
              <h1 className="min-w-0 flex-1 break-words text-xl font-semibold leading-snug text-stone-900">
                {profile ? publicName(profile) : ""}
              </h1>
              <button
                type="button"
                onClick={onEdit}
                className="min-h-11 shrink-0 touch-manipulation self-start rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 transition hover:bg-stone-100"
              >
                編集
              </button>
            </div>
          )}
          {editing && (
            <p className="flex min-h-20 min-w-0 flex-1 items-center text-xs leading-relaxed text-stone-500">
              アイコン・ニックネーム・ひとことは、ほかのゲストにも表示されます。
            </p>
          )}
        </div>

        {/* 自分で写真を設定しているときだけ。文字は小さく、タップ領域は 44px を保つ */}
        {profile?.customPhoto && (
          <button
            type="button"
            onClick={() => void onUseLineIcon()}
            disabled={iconBusy}
            className="-ml-2 min-h-11 touch-manipulation rounded-full px-2 text-xs text-stone-500 transition hover:bg-stone-100 disabled:opacity-40"
          >
            LINE のアイコンに戻す
          </button>
        )}

        {editing ? (
          <form onSubmit={onSave} className="mt-2 flex flex-col gap-3">
            <label className="block">
              <span className="text-sm font-medium text-stone-700">ニックネーム</span>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                autoComplete="nickname"
                className="mt-1 block min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-base text-stone-900 outline-none focus:border-stone-400"
              />
              <span className={`mt-1 block text-right text-xs tabular-nums ${nicknameOk ? "text-stone-400" : "text-rose-600"}`}>
                {nicknameCount} / {PROFILE_NICKNAME_MAX}
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-stone-700">ひとこと</span>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="例: 最近神奈川に引っ越しました！"
                className="mt-1 block min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-400"
              />
              <span className={`mt-1 block text-right text-xs tabular-nums ${bioOk ? "text-stone-400" : "text-rose-600"}`}>
                {bioCount} / {PROFILE_BIO_MAX}
              </span>
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="min-h-11 flex-1 touch-manipulation rounded-full border border-stone-200 bg-white text-sm text-stone-700 transition hover:bg-stone-100 disabled:opacity-40"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="min-h-11 flex-1 touch-manipulation rounded-full bg-stone-900 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </form>
        ) : (
          // 「LINE のアイコンに戻す」があるときは、その高さが余白の代わりになる
          <div className={profile?.customPhoto ? "" : "mt-3"}>
            {savedBio && <p className="break-words text-sm leading-relaxed text-stone-700">{savedBio}</p>}
            {tags.length > 0 && (
              <div className={`flex flex-wrap gap-1.5 ${savedBio ? "mt-2" : ""}`}>
                {tags.map((t) => (
                  <TagBadge key={t} id={t} />
                ))}
              </div>
            )}
          </div>
        )}

        {message && (
          <p className="mt-3 text-sm text-emerald-700" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-3 text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}
      </section>

      <section aria-label="自分の投稿" className="mt-5 border-t border-stone-200 pt-4">
        {mine.loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-stone-200/60" />
            ))}
          </div>
        ) : mine.error && mine.posts.length === 0 ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
            投稿を読み込めませんでした。時間をおいて、もう一度お試しください。
          </p>
        ) : mine.posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-400">
            まだ投稿がありません
          </p>
        ) : (
          <div className="space-y-3">
            {mine.posts.map((p) =>
              p.status !== "visible" ? (
                <p
                  key={p.id}
                  className="rounded-2xl border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-400"
                >
                  非表示にしました。
                </p>
              ) : (
                // ★openAs="page"★ 詳細シートを出せるのは /guestbook だけ（PostCard の★参照）
                user && <PostCard key={p.id} post={p} user={user} openAs="page" />
              ),
            )}
            {mine.hasMore && (
              <button
                type="button"
                onClick={() => void mine.loadMore()}
                disabled={mine.loadingMore}
                className="min-h-11 w-full touch-manipulation rounded-full border border-stone-200 bg-white text-sm text-stone-500 transition hover:bg-stone-100 disabled:opacity-50"
              >
                {mine.loadingMore ? "読み込み中…" : "もっと見る"}
              </button>
            )}
          </div>
        )}
      </section>
    </GuestbookShell>
  );
}
