"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

export type GuestSession = {
  user: User | null;
  tags: string[];
  isAdmin: boolean;
  loading: boolean;
  /** CTF でタグが付与された直後に呼ぶ */
  refreshTags: () => Promise<string[]>;
};

export function useGuestSession(): GuestSession {
  const [user, setUser] = useState<User | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const readClaims = useCallback(async (u: User | null, force = false) => {
    if (!u) {
      setTags([]);
      setIsAdmin(false);
      return [];
    }
    const res = await u.getIdTokenResult(force);
    const next = Array.isArray(res.claims.tags) ? (res.claims.tags as string[]) : [];
    setTags(next);
    setIsAdmin(res.claims.admin === true);
    return next;
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      await readClaims(u);
      setLoading(false);
    });
  }, [readClaims]);

  /**
   * ★重要な落とし穴★
   * Custom Claims はサーバーで書き換えても ID トークンが更新されるまで
   * （最大1時間）クライアントに反映されない。
   * 招待コード引き換え・CTF正解の直後は必ずこれを呼んで強制リフレッシュする。
   */
  const refreshTags = useCallback(
    () => readClaims(auth.currentUser, true),
    [readClaims],
  );

  return { user, tags, isAdmin, loading, refreshTags };
}
