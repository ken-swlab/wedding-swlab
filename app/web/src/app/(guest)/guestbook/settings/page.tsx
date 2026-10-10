"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { GuestbookShell } from "@/components/guestbook/GuestbookShell";
import { IconCropper } from "@/components/guestbook/IconCropper";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { useGuestbookData, useGuestbookUpload } from "@/components/guestbook/GuestbookDataProvider";
import { PostCard } from "@/components/guestbook/PostCard";
import { PostEditor } from "@/components/guestbook/PostEditor";
import { PostOwnerMenu } from "@/components/guestbook/PostOwnerMenu";
import { TagBadge } from "@/components/guestbook/TagBadge";
import { useMyPosts } from "@/hooks/useMyPosts";
import { postJson } from "@/lib/api-client";
import { cropForIcon, loadIconSource, type IconCrop, type IconSource } from "@/lib/image";
import { uploadThumb } from "@/lib/media";
import type { ReencodedJpeg } from "@/lib/thumb-guard";
import type { Post } from "@/types";
import { publicName } from "@/lib/names";
import { countChars } from "@/lib/text";
import { PROFILE_BIO_MAX, PROFILE_NICKNAME_MAX } from "@/config/profile";

const PROFILE_API = "/api/guest/profile";

/** まだ保存していないアイコンの変更。custom は切り取った画像、line は「LINE のアイコンに戻す」 */
type PendingIcon = { kind: "custom"; blob: ReencodedJpeg; url: string } | { kind: "line" };

/**
 * マイページ。自分のプロフィールと自分の投稿を見直し、ほかのゲストからどう見えているかを確かめる（Issue #87）。
 * ふだんは表示だけで、「編集」を押したときだけニックネーム・ひとことの入力欄に切り替わる。
 *
 * ★書き込みは /api/guest/profile だけ★ guests への本人の直接の書き込みは Rules で閉じている。
 *   保存した値は useGuestSession の guests の購読で戻ってくるので、ここで手元の表示を書き換えない。
 * ★アイコンの変更は「保存」を押すまでサーバーへ送らない★（Issue #88）
 *   写真を選ぶ → 切り取り画面（IconCropper）で決定 → 表示だけが変わる → 「保存」で送る。
 *   「LINE のアイコンに戻す」も同じ。ニックネーム・ひとことの変更があれば同じ保存でまとめて送る。
 * ★選んだ画像は保存まで端末のメモリ（Blob）に持つ★ 保存前にアップロードすると、
 *   キャンセルしたときに使われない画像だけが公開バケットに残る。
 * ★「保存しました」はサーバーへの保存が成功したあとにだけ出す★
 * ★タグは読み取り専用★ 付けるのは管理者（新郎新婦）。
 * ★新郎新婦が非表示にした自分の投稿は、その位置に「非表示にしました。」の1行だけを出す★
 *   本文・写真・日時・理由は出さず、開けもしない。非表示のコメントの一覧はどこにも出さない。
 * ★自分の投稿の編集・削除の入口は、ここ（自分の投稿一覧の「⋯」）だけ★（Issue #94）
 *   非表示にされた投稿には出さない。編集・削除のあとは、タイムライン側で遡って読んだ分も読み直す
 *   （購読していない分は、読んだ時点のまま残るため）。
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
  const [cropSource, setCropSource] = useState<IconSource | null>(null);
  const [pendingIcon, setPendingIcon] = useState<PendingIcon | null>(null);
  // 保存した直後、購読で新しい photoURL が届くまで出しておく表示（一瞬だけ前のアイコンに戻るのを防ぐ）
  const [settled, setSettled] = useState<{ url: string; from: string } | null>(null);
  // 送信済みの画像のキー。保存の通信だけ失敗してやり直すときに、同じ画像を二重に送らない
  const uploaded = useRef<{ blob: Blob; key: string } | null>(null);
  // プレビュー用に作った object URL。使い終わったら（遅くとも画面を離れるときに）解放する
  const previewUrls = useRef<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mine = useMyPosts(user?.uid ?? null);
  const timeline = useGuestbookData();
  const upload = useGuestbookUpload();
  const [editingPost, setEditingPost] = useState<Post | null>(null);

  /** 編集・削除した投稿を、マイページとタイムラインの両方の一覧に反映する */
  function syncPost(id: string) {
    void mine.syncPost(id);
    void timeline.syncPost(id);
  }

  const nicknameCount = countChars(nickname.trim());
  const bioCount = countChars(bio.trim());
  const nicknameOk = nicknameCount >= 1 && nicknameCount <= PROFILE_NICKNAME_MAX;
  const bioOk = bioCount <= PROFILE_BIO_MAX;
  const textChanged = editing && (nickname.trim() !== savedNickname || bio.trim() !== savedBio);
  const textOk = !editing || (nicknameOk && bioOk);
  const canSave = (textChanged || !!pendingIcon) && textOk && !saving;

  const savedPhotoURL = profile?.photoURL || user?.photoURL || "";
  // LINE のアイコンはログインのたびに Auth のユーザーへ反映している（/api/guest/profile と同じ出どころ）
  const linePhotoURL = user?.photoURL || "";
  const photoURL = pendingIcon
    ? pendingIcon.kind === "custom"
      ? pendingIcon.url
      : linePhotoURL
    : settled && settled.from === savedPhotoURL
      ? settled.url
      : savedPhotoURL;
  // いま表示しているアイコンが自分で設定した写真か（「LINE のアイコンに戻す」を出すか）
  const showingCustom = pendingIcon ? pendingIcon.kind === "custom" : !!profile?.customPhoto;

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.length = 0;
    };
  }, []);

  /** プレビュー用の object URL を、keep に指定したもの以外すべて解放する */
  function releasePreviews(keep?: string) {
    for (const url of previewUrls.current) if (url !== keep) URL.revokeObjectURL(url);
    previewUrls.current = keep ? [keep] : [];
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const body: { nickname?: string; bio?: string; iconKey?: string; iconSource?: "line" } = {};
      if (textChanged) {
        body.nickname = nickname.trim();
        body.bio = bio.trim();
      }
      if (pendingIcon?.kind === "custom") {
        if (uploaded.current?.blob !== pendingIcon.blob) {
          const { key } = await uploadThumb(pendingIcon.blob);
          uploaded.current = { blob: pendingIcon.blob, key };
        }
        body.iconKey = uploaded.current.key;
      } else if (pendingIcon?.kind === "line") {
        body.iconSource = "line";
      }
      await postJson(PROFILE_API, body);

      if (pendingIcon) {
        const url = pendingIcon.kind === "custom" ? pendingIcon.url : linePhotoURL;
        setSettled({ url, from: savedPhotoURL });
        releasePreviews(pendingIcon.kind === "custom" ? pendingIcon.url : undefined);
      }
      uploaded.current = null;
      setPendingIcon(null);
      setEditing(false);
      setMessage("保存しました");
    } catch (err) {
      console.error(err);
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

  /** アイコンも入力中の文字も元に戻す。サーバーには何も送っていないので、手元を捨てるだけでよい */
  function onCancel() {
    releasePreviews(settled?.url);
    uploaded.current = null;
    setPendingIcon(null);
    setEditing(false);
    setError(null);
  }

  /** 写真を選んだら切り取り画面を開く。ここではまだ何も送らない */
  async function onPickIcon(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 同じ写真をもう一度選んでも change が来るように空にしておく
    e.target.value = "";
    if (!file) return;
    setIconBusy(true);
    setMessage(null);
    setError(null);
    try {
      setCropSource(await loadIconSource(file));
    } catch (err) {
      // HEIC など、このブラウザが canvas に描けない形式
      console.error(err);
      setError("この形式の画像は使えません。別の写真を選んでください");
    } finally {
      setIconBusy(false);
    }
  }

  function closeCropper() {
    cropSource?.close();
    setCropSource(null);
  }

  /** 切り取りを決定する。表示だけを新しい画像に切り替え、「保存」を待つ */
  async function onCropDone(crop: IconCrop) {
    if (!cropSource) return;
    setIconBusy(true);
    try {
      const blob = await cropForIcon(cropSource, crop);
      const url = URL.createObjectURL(blob);
      releasePreviews(settled?.url);
      previewUrls.current.push(url);
      uploaded.current = null;
      setPendingIcon({ kind: "custom", blob, url });
    } catch (err) {
      console.error(err);
      setError("この形式の画像は使えません。別の写真を選んでください");
    } finally {
      closeCropper();
      setIconBusy(false);
    }
  }

  /** 表示だけ LINE のアイコンに切り替え、「保存」を待つ */
  function onUseLineIcon() {
    setMessage(null);
    setError(null);
    releasePreviews(settled?.url);
    uploaded.current = null;
    // もともと LINE のアイコンなら、選びかけの写真を捨てるだけでよい（保存するものが無い）
    setPendingIcon(profile?.customPhoto ? { kind: "line" } : null);
  }

  return (
    <GuestbookShell>
      <section aria-label="プロフィール">
        <div className="flex items-start gap-4">
          {/* アイコンを押すと端末の写真の選択が開く（写真ライブラリ・写真を撮る・ファイル） */}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={iconBusy || saving}
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
        {showingCustom && (
          <button
            type="button"
            onClick={onUseLineIcon}
            disabled={iconBusy || saving}
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
          <div className={showingCustom ? "" : "mt-3"}>
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

        {/* アイコンだけを変えたとき（入力欄を開いていないとき）の確定・取り消し */}
        {!editing && pendingIcon && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="min-h-11 flex-1 touch-manipulation rounded-full border border-stone-200 bg-white text-sm text-stone-700 transition hover:bg-stone-100 disabled:opacity-40"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!canSave}
              className="min-h-11 flex-1 touch-manipulation rounded-full bg-stone-900 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
            >
              {saving ? "保存中…" : "保存"}
            </button>
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
                user && (
                  <PostCard
                    key={p.id}
                    post={p}
                    user={user}
                    openAs="page"
                    actions={
                      <PostOwnerMenu
                        post={p}
                        onEdit={() => setEditingPost(p)}
                        onDeleted={() => {
                          // 送信待ちに残っている高画質版は、もう送らない
                          void upload.discard(p.id);
                          syncPost(p.id);
                        }}
                      />
                    }
                  />
                )
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
      {editingPost && user && (
        <PostEditor
          key={editingPost.id}
          post={editingPost}
          user={user}
          onClose={() => setEditingPost(null)}
          onSaved={() => syncPost(editingPost.id)}
        />
      )}
      {cropSource && (
        <IconCropper source={cropSource} onCancel={closeCropper} onDone={(crop) => void onCropDone(crop)} />
      )}
    </GuestbookShell>
  );
}
