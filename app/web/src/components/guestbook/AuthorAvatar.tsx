"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { auth } from "@/lib/firebase";
import type { PublicProfile } from "@/lib/profiles-client";
import { GUESTBOOK_PATHS } from "@/config/guestbook";

/**
 * 投稿者のアイコン。タップするとプロフィール（アイコン・ニックネーム・一言）を下から出す。
 * profile は useAuthorProfile で引いた最新の値を渡す（名前の表示と揃えるため、ここでは引かない）。
 */
export function AuthorAvatar({
  uid,
  profile,
  className,
  sizes,
}: {
  uid: string;
  profile: PublicProfile;
  /** 大きさと位置（h-10 w-10 など） */
  className: string;
  sizes: string;
}) {
  const [open, setOpen] = useState(false);

  function onClick(e: MouseEvent) {
    // カードのタップ（詳細を開く）として扱わない
    e.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${profile.name}さんのプロフィール`}
        className={`relative shrink-0 touch-manipulation overflow-hidden rounded-full bg-stone-200 ${className}`}
      >
        {profile.photoURL && <Image src={profile.photoURL} alt="" fill sizes={sizes} className="object-cover" />}
      </button>
      {open && <ProfileSheet uid={uid} profile={profile} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * 他のゲストのプロフィール。
 * ★タグ（所属）は出さない★ 他の人に見せるのはアイコン・ニックネーム・一言だけ。
 *   所属タグは本人の設定画面にだけ出す（オーナーの判断。Issue #49）。
 * ★document.body へ Portal で出す★ タイムラインの本文は引っ張って更新の間 transform が付き、
 *   中の fixed が画面に固定されなくなる（PullToRefresh の★参照）。
 * ★クリックを親へ伝えない★ Portal の中のイベントも React の木ではカードへ伝わり、
 *   背景のタップで投稿の詳細が開いてしまう。
 */
function ProfileSheet({
  uid,
  profile,
  onClose,
}: {
  uid: string;
  profile: PublicProfile;
  onClose: () => void;
}) {
  const mine = auth.currentUser?.uid === uid;

  // 裏の画面を止める。PullToRefresh もこれを見て引っ張りを始めない
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // 裏の詳細シートは Esc で閉じるので、ここで止める（捕捉段階で preventDefault する）
      e.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${profile.name}さんのプロフィール`}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white px-6 pt-6 text-center shadow-xl sm:rounded-2xl"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="relative mx-auto h-24 w-24 overflow-hidden rounded-full bg-stone-200">
          {profile.photoURL && <Image src={profile.photoURL} alt="" fill sizes="96px" className="object-cover" />}
        </div>
        <h2 className="mt-3 break-words text-lg font-semibold text-stone-900">{profile.name}</h2>
        {profile.bio ? (
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-700">{profile.bio}</p>
        ) : (
          <p className="mt-2 text-sm text-stone-400">ひとことはまだありません</p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          {mine && (
            <Link
              href={GUESTBOOK_PATHS.settings}
              onClick={onClose}
              className="flex min-h-11 touch-manipulation items-center justify-center rounded-full border border-stone-200 text-sm text-stone-700 transition hover:bg-stone-100"
            >
              プロフィールを編集
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 touch-manipulation rounded-full text-sm text-stone-500 transition hover:bg-stone-100"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
