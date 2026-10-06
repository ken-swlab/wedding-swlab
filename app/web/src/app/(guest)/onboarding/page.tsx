"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuestSession } from "@/hooks/useGuestSession";
import { OnboardingForm } from "@/components/guestbook/OnboardingForm";
import { SplashScreen } from "@/components/SplashScreen";
import { GuestShell } from "@/components/guestbook/GuestShell";
import { getJson, postJson } from "@/lib/api-client";
import type { InvitationStatus } from "@/types/invitation";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, profile } = useGuestSession();
  const needsCheck = profile !== null && !profile.isRegistered;
  const [cleared, setCleared] = useState(false);

  /**
   * 未登録ならパスコードを通ったかを確かめ、まだなら招待状のページへ戻す。
   * ★登録 API もパスコード通過を確かめている★ ここは送信してから断られないための案内で、守りではない。
   * 確認に失敗したときはフォームを出す（送信時にサーバーが判定する）。
   */
  useEffect(() => {
    if (!needsCheck) return;
    let cancelled = false;
    getJson<InvitationStatus>("/api/guest/invitation")
      .then((s) => {
        if (cancelled) return;
        if (s.cleared) setCleared(true);
        else router.replace("/invitation");
      })
      .catch(() => {
        if (!cancelled) setCleared(true);
      });
    return () => {
      cancelled = true;
    };
  }, [needsCheck, router]);

  // layout が揃うまで待つ。ここに来る時点で通常は揃っている
  if (!user || !profile || (needsCheck && !cleared)) return <SplashScreen phase="booting" />;

  return (
    <GuestShell>
      <OnboardingForm
        displayName={user.displayName}
        initialNickname={profile.nickname}
        onSubmit={async (answer) => {
          await postJson("/api/guest/register", answer);
          router.replace("/guestbook");
        }}
      />
    </GuestShell>
  );
}
