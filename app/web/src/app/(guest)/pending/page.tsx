"use client";

import { useRouter } from "next/navigation";
import { useGuestSession } from "@/hooks/useGuestSession";
import { PendingApproval } from "@/components/guestbook/PendingApproval";
import { SplashScreen } from "@/components/SplashScreen";
import { GuestShell } from "@/components/guestbook/GuestShell";

export default function PendingPage() {
  const router = useRouter();
  const { user, profile, refreshTags } = useGuestSession();

  if (!user || !profile) return <SplashScreen phase="booting" />;

  return (
    <GuestShell>
      <PendingApproval
        nickname={profile.nickname}
        approvedButStale={profile.isApproved}
        onEdit={() => router.push("/onboarding")}
        onRefresh={() => void refreshTags()}
      />
    </GuestShell>
  );
}
