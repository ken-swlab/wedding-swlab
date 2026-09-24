"use client";

import { useRouter } from "next/navigation";
import { useGuestSession } from "@/hooks/useGuestSession";
import { OnboardingForm } from "@/components/guestbook/OnboardingForm";
import { SplashScreen } from "@/components/SplashScreen";
import { GuestShell } from "@/components/guestbook/GuestShell";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, profile } = useGuestSession();

  // layout が揃うまで待つ。ここに来る時点で通常は揃っている
  if (!user || !profile) return <SplashScreen phase="booting" />;

  return (
    <GuestShell>
      <OnboardingForm
        user={user}
        initialNickname={profile.nickname}
        // 初回だけパスコードを求める。2回目以降の修正では求めない
        needsPasscode={!profile.isRegistered}
        onDone={() => router.replace("/guestbook")}
      />
    </GuestShell>
  );
}
