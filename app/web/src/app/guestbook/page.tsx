"use client";

import { useEffect, useState } from "react";
import { signInAnonymously } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ensureGuestDoc } from "@/lib/guests";
import { useGuestSession } from "@/hooks/useGuestSession";
import { usePosts } from "@/hooks/usePosts";
import { Composer } from "@/components/guestbook/Composer";
import { Timeline } from "@/components/guestbook/Timeline";

export default function GuestbookPage() {
  const { user, tags, loading: authLoading } = useGuestSession();
  const { posts, loading, error } = usePosts(tags);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (user) void ensureGuestDoc(user.uid, user.displayName ?? "ゲスト");
  }, [user]);

  async function onSignIn() {
    setSigningIn(true);
    try {
      await signInAnonymously(auth);
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-xl px-4 py-8">
        <header className="mb-6 text-center">
          <h1 className="font-serif text-2xl tracking-wide text-stone-900">Guest Book</h1>
          <p className="mt-1 text-sm text-stone-500">おふたりへのメッセージを残してください</p>
        </header>

        {authLoading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-stone-200/60" />
        ) : !user ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
            <p className="text-sm text-stone-600">ゲストブックを開くにはサインインしてください</p>
            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn}
              className="mt-4 rounded-full bg-stone-900 px-6 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {signingIn ? "接続中…" : "はじめる"}
            </button>
          </div>
        ) : tags.length === 0 ? (
          // Custom Claims が空 = まだ招待コードを引き換えていない状態。
          // ここを空タイムラインにすると原因不明に見えるので明示する。
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
            <p className="font-medium">招待コードの引き換えが必要です</p>
            <p className="mt-2 leading-relaxed">
              アカウントにまだタグが付与されていません。
              招待コード用の Route Handler（Admin SDK で setCustomUserClaims）を
              用意したうえで、引き換え後に <code>refreshTags()</code> を呼んでください。
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Composer user={user} tags={tags} />
            <Timeline posts={posts} loading={loading} error={error} uid={user.uid} />
          </div>
        )}
      </div>
    </main>
  );
}
