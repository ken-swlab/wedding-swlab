"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/lib/api-client";
import type { ReactionStatus } from "@/types/invitation";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { useApprovalAdvance } from "@/hooks/useApprovalAdvance";
import { PendingApproval } from "@/components/guestbook/PendingApproval";
import { SplashScreen } from "@/components/SplashScreen";
import { APPROVED_REVEAL_MS } from "@/config/opening";

/**
 * 承認待ち。承認されたら自動でトークンを取り直し、タグが乗れば (guest)/layout が /guestbook へ移す
 * （そこで承認後の演出（#150）が出る。Issue #156）。
 * ★セッションは layout のものを使う★ ここで useGuestSession を呼ぶと購読が別にでき、取り直したタグが
 *   layout の振り分けに届かない（Context の★参照）。
 */
export default function PendingPage() {
  const { user, profile, refreshTags } = useGuestSessionContext();
  const approved = profile?.isApproved === true;
  // ★「承認されました」を見せきってから取り直す★ 取り直しが済むと layout がすぐ /guestbook へ移す（Issue #165）
  const { stale, retry } = useApprovalAdvance({ approved, refresh: refreshTags, delayMs: APPROVED_REVEAL_MS });
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
      approved={approved}
      stale={stale}
      onRetry={retry}
    />
  );
}
