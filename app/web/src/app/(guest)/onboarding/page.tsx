"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuestSession } from "@/hooks/useGuestSession";
import { OnboardingForm } from "@/components/guestbook/OnboardingForm";
import { SplashScreen } from "@/components/SplashScreen";
import { GuestShell } from "@/components/guestbook/GuestShell";
import { getJson, postJson } from "@/lib/api-client";
import type { InvitationStatus } from "@/types/invitation";
import { useInvitationProgram } from "@/hooks/useInvitationProgram";
import { ProgramStrip } from "@/components/guestbook/ProgramList";
import { EntryFinish } from "@/components/opening/EntryFinish";
import { classifyDisplayName } from "@/lib/opening-names";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, profile } = useGuestSession();
  const needsCheck = profile !== null && !profile.isRegistered;
  const [cleared, setCleared] = useState(false);
  const program = useInvitationProgram(!!user);
  // 初めて送ったときだけエントリー完了を出す（Issue #149）。承認待ちからの「入力内容を変更する」では出さない
  const [finished, setFinished] = useState(false);

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
  if (finished) {
    return <EntryFinish guestName={classifyDisplayName(user.displayName).guest} onNext={() => router.replace("/guestbook")} />;
  }

  return (
    <GuestShell>
      {/* 当日の流れを上部に固定する（Issue #166。招待状のエントリー画面と同じ） */}
      {program && (
        <ProgramStrip
          program={program.program}
          date={program.date}
          venue={program.venue}
          className="-mx-4 mb-4"
          style={{ top: 0, paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
        />
      )}
      <OnboardingForm
        displayName={user.displayName}
        initialNickname={profile.nickname}
        program={program?.program}
        onSubmit={async (answer) => {
          const first = !profile.isRegistered;
          await postJson("/api/guest/register", answer);
          if (first) setFinished(true);
          else router.replace("/guestbook");
        }}
      />
    </GuestShell>
  );
}
