"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type GuestProfile = {
  nickname: string;
  displayName: string;
  isRegistered: boolean;
  isApproved: boolean;
  realName: string;
};

export type GuestSession = {
  user: User | null;
  tags: string[];
  isAdmin: boolean;
  loading: boolean;
  profile: GuestProfile | null;
  profileLoading: boolean;
  refreshTags: () => Promise<string[]>;
};

export function useGuestSession(): GuestSession {
  const [user, setUser] = useState<User | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const lastSeen = useRef(0);

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
      if (!u) {
        setProfile(null);
        setProfileLoading(false);
      }
    });
  }, [readClaims]);

  const refreshTags = useCallback(
    () => readClaims(auth.currentUser, true),
    [readClaims],
  );

  /**
   * 自分の /guests/{uid} を購読する。ここから2つを同時に得ている:
   *  - 登録/承認ステータス（オンボーディングの分岐に使う）
   *  - claimsUpdatedAt（管理者がタグを変えた合図。匿名ユーザーには
   *    revokeRefreshTokens() が使えないため、この方式で取り直す）
   */
  useEffect(() => {
    if (!user) return;
    setProfileLoading(true);

    return onSnapshot(
      doc(db, "guests", user.uid),
      (snap) => {
        const d = snap.data();

        // LINEプロフィールが更新されていればFirestoreに自動同期する
        if (d && user && user.displayName) {
          const authName = user.displayName;
          const authPhoto = user.photoURL || "";
          if (d.lineDisplayName !== authName || d.photoURL !== authPhoto) {
            void updateDoc(doc(db, "guests", user.uid), {
              lineDisplayName: authName,
              photoURL: authPhoto
            }).catch(() => {});
          }
        }
        setProfile({
          nickname: d?.nickname ?? "",
          displayName: d?.displayName ?? user.displayName ?? "ゲスト",
          isRegistered: d?.isRegistered === true,
          isApproved: d?.isApproved === true,
          realName: d?.realName ?? "",
        });
        setProfileLoading(false);

        const ms: number | undefined = d?.claimsUpdatedAt?.toMillis?.();
        if (typeof ms === "number" && ms > lastSeen.current) {
          lastSeen.current = ms;
          void readClaims(auth.currentUser, true);
        }
      },
      () => setProfileLoading(false),
    );
  }, [user, readClaims]);

  return { user, tags, isAdmin, loading, profile, profileLoading, refreshTags };
}
