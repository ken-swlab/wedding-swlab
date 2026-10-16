"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/lib/api-client";
import type { InvitationStatus, ProgramItem } from "@/types/invitation";

/** エントリー画面の上部（ProgramStrip）と挙式の選択肢に使う、当日の流れ */
export type InvitationProgram = {
  program: readonly ProgramItem[];
  /** config/invitation の opening.date */
  date: string;
  /** config/invitation の opening.venue（短い表記） */
  venue: string;
};

/**
 * 当日の流れ（Issue #166。以前の useInvitationCeremony）。GET /api/guest/invitation から受け取る。
 * ★時刻をコードに書かない★ 本物は config/invitation の program だけにある。
 * 読み込み中・未設定・読めなかったときは null（フォームは時刻なし・上部の当日の流れなしで聞く）。
 */
export function useInvitationProgram(enabled: boolean): InvitationProgram | null {
  const [value, setValue] = useState<InvitationProgram | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getJson<InvitationStatus>("/api/guest/invitation")
      .then((s) => {
        if (cancelled || !s.invitation || !s.opening) return;
        setValue({ program: s.invitation.program, date: s.opening.date, venue: s.opening.venue });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return value;
}
