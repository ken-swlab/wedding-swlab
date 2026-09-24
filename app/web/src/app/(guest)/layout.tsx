"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useGuestSession } from "@/hooks/useGuestSession";
import { SplashScreen } from "@/components/SplashScreen";

/**
 * ★ゲスト画面の振り分けをここ1箇所に集める★
 *   /onboarding /pending /guestbook の3画面それぞれで判定すると
 *   useGuestSession が3重に走り、遷移のたびにスプラッシュがちらつく。
 *
 * ★これはセキュリティ境界ではない★
 *   Cookie も Middleware も使っていないため、URL を直接叩けば
 *   HTML は誰にでも返る。実際の防御は次の2つが担う:
 *     - Firestore / Storage Rules（Custom Claims の tags）
 *     - 各 Route Handler の verifyIdToken
 *   ここは体験のための整理であって、守りではない。
 */
export default function GuestLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isActive, tags, loading, profile, profileLoading } = useGuestSession();

  const ready = !loading && (!user || !profileLoading);

  /**
   * 登録済みでも /onboarding には留まれるようにする。
   * 「入力内容を変更する」の導線がここを通るため、
   * 一律に追い出すと修正ができなくなる。
   */
  const mayStayOnOnboarding = pathname === "/onboarding" && profile?.isRegistered === true;

  let dest: string | null = null;
  if (ready) {
    if (!user) dest = "/invitation";
    else if (!isActive) dest = "/invitation";
    // profile が読めないまま確定した場合（Rules の一時失敗など）は
    // 固まらせず登録フォームへ送る。そこで guests ドキュメントが作られる
    else if (!profile) dest = "/onboarding";
    else if (!profile.isRegistered) dest = "/onboarding";
    else if (mayStayOnOnboarding) dest = "/onboarding";
    else if (!(profile.isApproved && tags.length > 0)) dest = "/pending";
    else dest = "/guestbook";
  }

  useEffect(() => {
    if (!ready) return;
    // 停止されたら先にサインアウトする。user が消えると dest が /invitation になる
    if (user && !isActive) {
      void signOut(auth);
      return;
    }
    if (dest && pathname !== dest) router.replace(dest);
  }, [ready, dest, pathname, router, user, isActive]);

  // 遷移が終わるまで同じ画面を出し続けて白画面を挟まない
  if (!ready || !dest || pathname !== dest) {
    return <SplashScreen phase="booting" />;
  }
  return <>{children}</>;
}
