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

/**
 * ★前回のプロフィールを端末に覚えておき、起動の直後はそれで画面を決める★（Issue #250）
 *   以前は、自分の guests/{uid} が Firestore から届くまでスプラッシュのままで、届いてからタイムラインを描き、
 *   そこから投稿の購読を始めていた（遅い回線では往復が重なる）。覚えた値で先に描けば、投稿の購読も同時に始まる。
 *   届いた本物の値で必ず上書きする（承認が外れていれば (guest)/layout が承認待ちへ移す）。
 * ★覚えるのは guests の公開して困らない値だけ★（ニックネーム・アイコンの URL・ひとこと・登録と承認の状態）。
 *   LINE の表示名（Auth の値）・guestPrivate の値は覚えない。uid ごとに1つ（別の人の値は使わない）。
 * ★守りではない★ 見られるデータは Rules と Custom Claims が決める（承認が外れた人が古い値で一瞬画面を見ても、
 *   投稿は Rules が出さない）。
 */
const PROFILE_CACHE_KEY = "wedding:profile:v1";
type CachedProfile = Omit<GuestProfile, "displayName"> & { uid: string };

function readCachedProfile(uid: string): Omit<GuestProfile, "displayName"> | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<CachedProfile>;
    if (c.uid !== uid || typeof c.isRegistered !== "boolean" || typeof c.isApproved !== "boolean") return null;
    return {
      nickname: typeof c.nickname === "string" ? c.nickname : "",
      isRegistered: c.isRegistered,
      isApproved: c.isApproved,
      photoURL: typeof c.photoURL === "string" ? c.photoURL : "",
      bio: typeof c.bio === "string" ? c.bio : "",
      customPhoto: c.customPhoto === true,
    };
  } catch {
    return null;
  }
}

function writeCachedProfile(uid: string, p: GuestProfile) {
  try {
    const c: CachedProfile = { uid, nickname: p.nickname, isRegistered: p.isRegistered, isApproved: p.isApproved, photoURL: p.photoURL, bio: p.bio, customPhoto: p.customPhoto };
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* 覚えられなくても、届くのを待つだけ */
  }
}

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
  /**
   * 「写真は2回に分けて届けます」の説明を見たか（guestPrivate.photoIntroSeen。Issue #272）。
   * 写真付きで初めて投稿したときだけ出す。読めない・未設定は false
   */
  photoIntroSeen: boolean;
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
  const [activeState, setActiveState] = useState<{ uid: string; isActive: boolean; invitationKind: "friend" | "family"; textScale: TextScale | null; photoIntroSeen: boolean } | null>(null);
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
      // 前回のプロフィール（端末に覚えた値）で先に画面を決める。本物は guests の購読が届いたら上書きする
      if (u) {
        const cached = readCachedProfile(u.uid);
        if (cached) {
          setProfileState((prev) => (prev?.uid === u.uid ? prev : { uid: u.uid, profile: { ...cached, displayName: u.displayName ?? "ゲスト" } }));
        }
      }
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
        const profile: GuestProfile = {
          nickname: d?.nickname ?? "",
          displayName: user.displayName ?? "ゲスト",
          isRegistered: d?.isRegistered === true,
          isApproved: d?.isApproved === true,
          photoURL: typeof d?.photoURL === "string" ? d.photoURL : "",
          bio: typeof d?.bio === "string" ? d.bio : "",
          customPhoto: d?.photoSource === "custom",
        };
        setProfileState({ uid: user.uid, profile });
        // ★サーバーから届いた値だけを覚える★（端末に残っていた古い値で上書きしない）
        if (!snap.metadata.fromCache) writeCachedProfile(user.uid, profile);

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
          photoIntroSeen: snap.data()?.photoIntroSeen === true,
        }),
      // 読めないときは停止と決めつけない（Rules の一時的な失敗で閉め出さない）
      // ★読めないときは「説明を見た」扱いにする★ 毎回出してしまうより、出さないほうが害が少ない
      () => setActiveState({ uid: user.uid, isActive: true, invitationKind: "friend", textScale: null, photoIntroSeen: true }),
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
  // 読み終える前は「見た」扱い（読み終えてから出すかを決める）
  const photoIntroSeen = user && activeState?.uid === user.uid ? activeState.photoIntroSeen : true;
  // guestPrivate を読み終えたか（文字の大きさを決められるか）
  const privateReady = !!user && activeState?.uid === user.uid;

  return { user, isActive, invitationKind, textScale, photoIntroSeen, privateReady, tags, isAdmin, loading, profile, profileLoading, refreshTags };
}
