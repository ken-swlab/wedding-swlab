"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type GuestProfile = {
  nickname: string;
  /**
   * ニックネーム未設定時のフォールバック。
   * ★Firestore ではなく Firebase Auth の値を使う★
   *   LINE の表示名は guests から guestPrivate へ移したが、
   *   同じ値は Auth のユーザーレコードに入っていて、
   *   追加の読み取りなしに取れる。
   */
  displayName: string;
  isRegistered: boolean;
  isApproved: boolean;
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

        /**
         * アイコンだけ Firestore に同期する。
         *
         * ★氏名は同期しない★
         *   以前は lineDisplayName も書こうとしていたが、Rules の
         *   update は displayName / photoURL / bio しか許しておらず、
         *   この書き込みは毎回失敗していた（catch で握り潰されていた）。
         *   氏名は guestPrivate に移したので、更新は
         *   /api/auth/line が Admin SDK で行う。
         */
        if (d && user && user.photoURL && d.photoURL !== user.photoURL) {
          void updateDoc(doc(db, "guests", user.uid), {
            photoURL: user.photoURL,
          }).catch(() => {});
        }
        setProfile({
          nickname: d?.nickname ?? "",
          displayName: user.displayName ?? "ゲスト",
          isRegistered: d?.isRegistered === true,
          isApproved: d?.isApproved === true,
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
