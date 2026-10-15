"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getJson } from "@/lib/api-client";
import type { InvitationStatus, ReactionStatus } from "@/types/invitation";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { useApprovalAdvance } from "@/hooks/useApprovalAdvance";
import { PendingApproval, pendingAnswerSummary } from "@/components/guestbook/PendingApproval";
import { SplashScreen } from "@/components/SplashScreen";

/**
 * 承認待ち。承認されたら自動でトークンを取り直し、タグが乗れば (guest)/layout が /guestbook へ移す
 * （そこで承認後の演出（#150）が出る。Issue #156）。
 * ★セッションは layout のものを使う★ ここで useGuestSession を呼ぶと購読が別にでき、取り直したタグが
 *   layout の振り分けに届かない（Context の★参照）。
 */
export default function PendingPage() {
  const { user, profile, refreshTags } = useGuestSessionContext();
  const approved = profile?.isApproved === true;
  const { stale, retry } = useApprovalAdvance({ approved, refresh: refreshTags });
  // オープニングのリアクションタイム（Issue #131）。読めなくても承認待ちの画面は出す
  const [reactionMs, setReactionMs] = useState<number | null | undefined>(undefined);
  // 確認までの目安（config/invitation）と回答の要点（Issue #157 B-4）。読めなければ出さない
  const [approvalNote, setApprovalNote] = useState<string | null>(null);
  const [answerSummary, setAnswerSummary] = useState<string | null>(null);
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getJson<ReactionStatus>("/api/guest/reaction")
      .then((r) => {
        if (!cancelled) setReactionMs(r.reactionMs);
      })
      .catch(() => {});
    getJson<InvitationStatus>("/api/guest/invitation")
      .then((s) => {
        if (!cancelled) setApprovalNote(s.invitation?.approvalNote ?? null);
      })
      .catch(() => {});
    // ★自分の guestPrivate を直接読む★（Rules で本人は get できる）。出すのは出欠と挙式だけ（pendingAnswerSummary）
    getDoc(doc(db, "guestPrivate", uid))
      .then((snap) => {
        if (!cancelled) setAnswerSummary(pendingAnswerSummary(snap.get("attendance"), snap.get("ceremony")));
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
      approvalNote={approvalNote}
      answerSummary={answerSummary}
    />
  );
}
