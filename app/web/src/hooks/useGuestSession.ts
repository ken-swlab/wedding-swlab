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
  /**
   * 管理者によるアクセス停止。未設定・読めない場合は true（有効）。
   * guestPrivate/{uid} は本人と管理者だけが読めるので、
   * 他のゲストの停止状態は見えない。
   */
  isActive: boolean;
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
  const [isActive, setIsActive] = useState(true);
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

  /**
   * 自分の /guestPrivate/{uid} を購読してアクセス停止を検知する。
   * 実際の締め出しは tags が空になることで既に成立しているが、
   * 「承認待ち」と「停止」では出すべき画面が違うので区別する。
   */
  useEffect(() => {
    if (!user) {
      setIsActive(true);
      return;
    }
    return onSnapshot(
      doc(db, "guestPrivate", user.uid),
      (snap) => setIsActive(snap.data()?.isActive !== false),
      // 読めないときは停止と決めつけない（Rules の一時的な失敗で閉め出さない）
      () => setIsActive(true),
    );
  }, [user]);

  return { user, isActive, tags, isAdmin, loading, profile, profileLoading, refreshTags };
}
