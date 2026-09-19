"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuestSession } from "@/hooks/useGuestSession";
import { usePosts } from "@/hooks/usePosts";
import { useUpload } from "@/hooks/useUpload";
import { Composer } from "@/components/guestbook/Composer";
import { Timeline } from "@/components/guestbook/Timeline";
import { OnboardingForm } from "@/components/guestbook/OnboardingForm";
import { PendingApproval } from "@/components/guestbook/PendingApproval";
import { UploadStatusBar } from "@/components/guestbook/UploadStatusBar";
import { SplashScreen } from "@/components/SplashScreen";

export default function GuestbookPage() {
  const router = useRouter();
  const { user, tags, loading: authLoading, profile, profileLoading, refreshTags } =
    useGuestSession();
  const { posts, loading, error } = usePosts(tags);
  // ★Composer の外に置くこと★ 投稿直後に Composer はリセットされるため
  const upload = useUpload();
  const [editing, setEditing] = useState(false);

  // 認証は / の LIFF フローに一本化。authLoading の解決を待つこと。
  useEffect(() => {
    if (!authLoading && !user) router.replace("/");
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return <SplashScreen phase={authLoading ? "booting" : "line-login"} />;
  }
  if (profileLoading || !profile) {
    return <SplashScreen phase="booting" />;
  }

  // 「登録 → 承認 → 解放」の3段階。タグの有無は承認の結果でしかない。
  const needsOnboarding = editing || !profile.isRegistered;
  const unlocked = profile.isApproved && tags.length > 0;

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-xl px-4 py-8">
        <header className="mb-6 text-center">
          <h1 className="font-serif text-2xl tracking-wide text-stone-900">Guest Book</h1>
          <p className="mt-1 text-sm text-stone-500">おふたりへのメッセージを残してください</p>
        </header>

        {needsOnboarding ? (
          <OnboardingForm
            user={user}
            initialNickname={profile.nickname}
            onDone={() => setEditing(false)}
          />
        ) : !unlocked ? (
          <PendingApproval
            nickname={profile.nickname}
            approvedButStale={profile.isApproved}
            onEdit={() => setEditing(true)}
            onRefresh={() => void refreshTags()}
          />
        ) : (
          <div className="space-y-4">
            <UploadStatusBar
              jobs={upload.jobs}
              onRetry={upload.retryFailed}
              onDismiss={upload.clearDone}
            />
            <Composer user={user} tags={tags} onUploadOriginals={upload.enqueue} />
            <Timeline posts={posts} loading={loading} error={error} user={user} />
          </div>
        )}
      </div>
    </main>
  );
}
