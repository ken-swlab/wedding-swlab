"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/lib/api-client";
import type { ReactionStatus } from "@/types/invitation";
import { useGuestSession } from "@/hooks/useGuestSession";
import { PendingApproval } from "@/components/guestbook/PendingApproval";
import { SplashScreen } from "@/components/SplashScreen";

export default function PendingPage() {
  const { user, profile, refreshTags } = useGuestSession();
  // オープニングのリアクションタイム（Issue #131）。読めなくても承認待ちの画面は出す
  const [reactionMs, setReactionMs] = useState<number | null | undefined>(undefined);
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getJson<ReactionStatus>("/api/guest/reaction")
      .then((r) => {
        if (!cancelled) setReactionMs(r.reactionMs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!user || !profile) return <SplashScreen phase="booting" />;

  return (
    <PendingApproval
      reactionMs={reactionMs}
      approvedButStale={profile.isApproved}
      onRefresh={() => void refreshTags()}
    />
  );
}
