"use client";

import { TEXT_SCALES, type TextScale } from "@/config/text-scale";
import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
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
  /** 他のゲストに見せるアイコン（guests.photoURL）。LINE の画像か、本人が設定した画像 */
  photoURL: string;
  /** 一言ステータス（guests.bio） */
  bio: string;
  /** 本人が設定したアイコンを使っているか（false なら LINE のアイコン） */
  customPhoto: boolean;
};

export type GuestSession = {
  user: User | null;
  /**
   * 管理者によるアクセス停止。未設定・読めない場合は true（有効）。
   * guestPrivate/{uid} は本人と管理者だけが読めるので、
   * 他のゲストの停止状態は見えない。
   */
  isActive: boolean;
  /**
   * どちらの招待状から答えたか（guestPrivate.invitationKind。Issue #240）。未設定・読めない場合は "friend"。
   * 承認待ち・回答の修正の画面を親族用の文字の大きさ・フォームにするために使う（守りではない）。
   */
  invitationKind: "friend" | "family";
  /**
   * 本人が選んだ文字の大きさ（guestPrivate.textScale。Issue #243）。未設定・読めない場合は null
   * （実際の大きさは config/text-scale.ts の effectiveTextScale で決める）。
   */
  textScale: TextScale | null;
  /** guestPrivate を読み終えたか（invitationKind・textScale が確かか） */
  privateReady: boolean;
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
  /**
   * ★profile と isActive は「誰の値か（uid）」と一緒に持つ★
   *   user が変わった瞬間は描画時に「読み込み中」「有効」へ戻る。
   *   effect の中で setState してリセットすると、描画が二重に走るうえ、
   *   切り替わりの一瞬に前のユーザーのプロフィールが見えてしまう。
   */
  const [profileState, setProfileState] = useState<{ uid: string; profile: GuestProfile | null } | null>(null);
  const [activeState, setActiveState] = useState<{ uid: string; isActive: boolean; invitationKind: "friend" | "family"; textScale: TextScale | null } | null>(null);
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

    return onSnapshot(
      doc(db, "guests", user.uid),
      (snap) => {
        const d = snap.data();

        /**
         * ★アイコンをここから書かない★
         *   以前は Auth の photoURL（LINE の画像）を guests へ書き戻していたが、
         *   本人が設定したアイコンを上書きしてしまう。Rules でも本人の直接の書き込みは閉じた。
         *   LINE の画像の追従は /api/auth/line が行う（photoSource が "custom" のときは除く）。
         */
        setProfileState({
          uid: user.uid,
          profile: {
            nickname: d?.nickname ?? "",
            displayName: user.displayName ?? "ゲスト",
            isRegistered: d?.isRegistered === true,
            isApproved: d?.isApproved === true,
            photoURL: typeof d?.photoURL === "string" ? d.photoURL : "",
            bio: typeof d?.bio === "string" ? d.bio : "",
            customPhoto: d?.photoSource === "custom",
          },
        });

        const ms: number | undefined = d?.claimsUpdatedAt?.toMillis?.();
        if (typeof ms === "number" && ms > lastSeen.current) {
          lastSeen.current = ms;
          void readClaims(auth.currentUser, true);
        }
      },
      () => setProfileState({ uid: user.uid, profile: null }),
    );
  }, [user, readClaims]);

  /**
   * 自分の /guestPrivate/{uid} を購読してアクセス停止を検知する。
   * 実際の締め出しは tags が空になることで既に成立しているが、
   * 「承認待ち」と「停止」では出すべき画面が違うので区別する。
   */
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "guestPrivate", user.uid),
      (snap) =>
        setActiveState({
          uid: user.uid,
          isActive: snap.data()?.isActive !== false,
          invitationKind: snap.data()?.invitationKind === "family" ? "family" : "friend",
          textScale: (TEXT_SCALES as readonly unknown[]).includes(snap.data()?.textScale) ? (snap.data()?.textScale as TextScale) : null,
        }),
      // 読めないときは停止と決めつけない（Rules の一時的な失敗で閉め出さない）
      () => setActiveState({ uid: user.uid, isActive: true, invitationKind: "friend", textScale: null }),
    );
  }, [user]);

  const profileReady = !!user && profileState?.uid === user.uid;
  const profile = profileReady ? profileState.profile : null;
  // ログインしていなければ、認証の確定（loading）までを読み込み中とする（以前と同じ）
  const profileLoading = user ? !profileReady : loading;
  // 未ログイン・読み込み前は有効扱い（以前と同じ）
  const isActive = user && activeState?.uid === user.uid ? activeState.isActive : true;
  const invitationKind = user && activeState?.uid === user.uid ? activeState.invitationKind : "friend";
  const textScale = user && activeState?.uid === user.uid ? activeState.textScale : null;
  // guestPrivate を読み終えたか（文字の大きさを決められるか）
  const privateReady = !!user && activeState?.uid === user.uid;

  return { user, isActive, invitationKind, textScale, privateReady, tags, isAdmin, loading, profile, profileLoading, refreshTags };
}
