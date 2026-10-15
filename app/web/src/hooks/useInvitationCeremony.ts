"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/lib/api-client";
import type { CeremonyInfo, InvitationStatus } from "@/types/invitation";

/**
 * 回答フォームに出す挙式の時刻と案内文（Issue #146）。GET /api/guest/invitation から受け取る。
 * ★時刻をコードに書かない★ 本物は config/invitation の ceremony だけにある。
 * 読み込み中・未設定・読めなかったときは null（フォームは時刻なしで聞く）。
 */
export function useInvitationCeremony(enabled: boolean): CeremonyInfo | null {
  const [ceremony, setCeremony] = useState<CeremonyInfo | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getJson<InvitationStatus>("/api/guest/invitation")
      .then((s) => {
        if (!cancelled) setCeremony(s.invitation?.ceremony ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return ceremony;
}
