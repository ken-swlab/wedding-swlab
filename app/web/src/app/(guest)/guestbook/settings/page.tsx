"use client";

import Image from "next/image";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { GuestbookShell } from "@/components/guestbook/GuestbookShell";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { TagBadge } from "@/components/guestbook/TagBadge";
import { postJson } from "@/lib/api-client";
import { compressForIcon } from "@/lib/image";
import { uploadThumb } from "@/lib/media";
import { countChars } from "@/lib/text";
import { PROFILE_BIO_MAX, PROFILE_NICKNAME_MAX } from "@/config/profile";

const PROFILE_API = "/api/guest/profile";

/**
 * 設定（プロフィール）。アイコン・ニックネーム・一言を変え、所属タグを見る。
 *
 * ★書き込みは /api/guest/profile だけ★ guests への本人の直接の書き込みは Rules で閉じている。
 *   保存した値は useGuestSession の guests の購読で戻ってくるので、ここで手元の表示を書き換えない。
 * ★アイコンは選んだらすぐ保存する★ 画像を送ってから「保存」を押し忘れると、
 *   使われない画像だけが公開バケットに残る。
 * ★タグは読み取り専用★ 付けるのは管理者（新郎新婦）。
 */
export default function SettingsPage() {
  const { user, profile, tags } = useGuestSessionContext();
  const savedNickname = profile?.nickname ?? "";
  const savedBio = profile?.bio ?? "";

  const [nickname, setNickname] = useState(savedNickname);
  const [bio, setBio] = useState(savedBio);
  const [saving, setSaving] = useState(false);
  const [iconBusy, setIconBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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
      setNickname(nickname.trim());
      setBio(bio.trim());
      setMessage("保存しました");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
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
      const { key } = await uploadThumb(blob, "image/jpeg", "thumb", "jpg");
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
      <h1 className="mb-4 font-serif text-xl tracking-wide text-stone-900">プロフィール</h1>

      <section className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
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
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={iconBusy}
              className="min-h-11 touch-manipulation rounded-full border border-stone-200 px-4 text-sm text-stone-700 transition hover:bg-stone-100 disabled:opacity-40"
            >
              写真を選ぶ
            </button>
            {profile?.customPhoto && (
              <button
                type="button"
                onClick={() => void onUseLineIcon()}
                disabled={iconBusy}
                className="min-h-11 touch-manipulation rounded-full px-4 text-sm text-stone-500 transition hover:bg-stone-100 disabled:opacity-40"
              >
                LINE のアイコンに戻す
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={(e) => void onPickIcon(e)}
            className="hidden"
          />
        </div>

        <form onSubmit={onSave} className="mt-5 flex flex-col gap-4">
          <label className="block">
            <span className="text-sm font-medium text-stone-700">ニックネーム</span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                setMessage(null);
              }}
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
              onChange={(e) => {
                setBio(e.target.value);
                setMessage(null);
              }}
              placeholder="例: 最近神奈川に引っ越しました！"
              className="mt-1 block min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-400"
            />
            <span className={`mt-1 block text-right text-xs tabular-nums ${bioOk ? "text-stone-400" : "text-rose-600"}`}>
              {bioCount} / {PROFILE_BIO_MAX}
            </span>
          </label>

          <p className="text-xs leading-relaxed text-stone-500">
            アイコン・ニックネーム・ひとことは、ほかのゲストにも表示されます。
          </p>

          <button
            type="submit"
            disabled={!canSave}
            className="min-h-11 touch-manipulation rounded-full bg-stone-900 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </form>

        {message && (
          <p className="mt-3 text-center text-sm text-emerald-700" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-3 text-center text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-stone-700">所属</h2>
        {tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <TagBadge key={t} id={t} />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-400">まだありません</p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-stone-500">所属は新郎新婦が設定します。変更はできません。</p>
      </section>
    </GuestbookShell>
  );
}
