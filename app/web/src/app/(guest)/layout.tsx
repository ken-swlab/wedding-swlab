"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearDeviceData } from "@/lib/firebase";
import { useGuestSession } from "@/hooks/useGuestSession";
import { SplashScreen } from "@/components/SplashScreen";
import { GuestSessionProvider } from "@/components/guestbook/GuestSessionContext";
import { GUESTBOOK_PATHS, isGuestbookPath } from "@/config/guestbook";
import { GUIDE_PATHS, isGuidePath } from "@/config/guide";
import { recallInvitationKind } from "@/lib/invitation-kind-local";
import { useTextScale } from "@/hooks/useTextScale";
import { useLineAccountCheck } from "@/hooks/useLineAccountCheck";
import { effectiveTextScale } from "@/config/text-scale";
import { readLastScreen, saveLastScreen } from "@/lib/resume";
import { useResumeScroll } from "@/hooks/useResumeScroll";


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
  const session = useGuestSession();
  const { user, isActive, tags, loading, profile, profileLoading } = session;

  const ready = !loading && (!user || !profileLoading);

  /**
   * ★文字の大きさ（Issue #243）★ ゲストの画面ぜんぶ（ゲストブック・ご案内・登録フォーム・承認待ち）に効かせる。
   *   本人の設定（guestPrivate.textScale）が無ければ、親族用から答えた人は大きく。まだ答えていない人は、
   *   この端末で最後に開いた招待状の種類で決める（親族用の招待状から来た人を、登録フォームでも大きくする）。
   *   guestPrivate を読み終えるまでは null（この端末で最後に使った大きさのまま）。
   */
  // LINE のアカウントの確認は、最初の画面のあとに後ろで行う（Issue #250。hooks/useLineAccountCheck.ts の★）
  useLineAccountCheck(ready ? user : null);

  const scaleKind = profile?.isRegistered ? session.invitationKind : recallInvitationKind();
  useTextScale(session.privateReady || (ready && !user) ? effectiveTextScale(session.textScale, scaleKind) : null);

  /**
   * 登録済みでも /onboarding には留まれるようにする。
   * 「入力内容を変更する」の導線がここを通るため、
   * 一律に追い出すと修正ができなくなる。
   */
  const mayStayOnOnboarding = pathname === "/onboarding" && profile?.isRegistered === true;
  /**
   * ★承認待ちの人も「回答を直す」（/guide/questionnaire）には入れる★（Issue #149）
   *   ほかの /guide 以下は承認後だけ。書き込みは /api/guest/questionnaire（登録済みかを確かめる）。
   */
  const pendingMayEdit = pathname === GUIDE_PATHS.questionnaire && profile?.isRegistered === true;

  const approved = ready && !!user && isActive && !!profile?.isRegistered && !!profile.isApproved && tags.length > 0;
  /**
   * ★開き直したら、最後に見ていた画面へ★（Issue #273。lib/resume.ts）承認済みの人が、このページで最初にゲストブックの
   *   トップへ入ってきたときだけ。行き先（dest）を初めから戻る先にするので、トップを一瞬はさまない。
   */
  //   ★決めるのは、承認済みと分かった最初の1回だけ（decided）★ この layout はゲストの画面を移っても作り直されない。
  //   ★戻すのは、最初にゲストブックのトップ（/guestbook。クエリなし）に入ってきたときだけ★ LIFF の入口・招待状・
  //   トップ（/）はどれも /guestbook へ移る。リッチメニューなどで別の画面を直接開いたときは、その画面のまま。
  const [decided, setDecided] = useState(false);
  const [resume, setResume] = useState<{ path: string; y: number } | null>(null);
  // スクロール位置を戻す先（戻る先に着いたあとも、位置を戻し終えるまで持つ）
  const [resumeScroll, setResumeScroll] = useState<{ path: string; y: number } | null>(null);
  if (approved && !decided) {
    setDecided(true);
    const atHome = pathname === GUESTBOOK_PATHS.home && (typeof window === "undefined" || window.location.search === "");
    const last = atHome && user ? readLastScreen(user.uid) : null;
    if (last) {
      setResume(last);
      setResumeScroll(last);
    }
  }

  let dest: string | null = null;
  if (ready) {
    // 未ログインは招待状へ。この端末で親族用を開いていたら親族用へ（Issue #240。使い勝手のためだけ）
    if (!user) dest = recallInvitationKind() === "family" ? "/invitation/family" : "/invitation";
    else if (!isActive) dest = "/invitation";
    // profile が読めないまま確定した場合（Rules の一時失敗など）は
    // 固まらせず登録フォームへ送る。そこで guests ドキュメントが作られる
    else if (!profile) dest = "/onboarding";
    else if (!profile.isRegistered) dest = "/onboarding";
    else if (mayStayOnOnboarding) dest = "/onboarding";
    else if (!(profile.isApproved && tags.length > 0)) dest = pendingMayEdit ? pathname : "/pending";
    // 承認済みなら /guestbook 以下の画面（通知・設定・投稿の詳細）と、案内モード（/guide 以下）にも留まれる
    else if (resume) dest = resume.path;
    else dest = isGuestbookPath(pathname) || isGuidePath(pathname) ? pathname : GUESTBOOK_PATHS.home;
  }
  // 戻る先に着いたら、ふつうの振り分けに戻す（そのあとのタブの移動を戻る先へ引き戻さない）
  if (resume && pathname === resume.path) setResume(null);

  // 最後に見ていた画面を覚える（画面を移るたびと、見えなくなるとき。Issue #273）
  //   ★戻る先へ移るまでは覚えない★（入口のトップで上書きしない）
  const uid = approved && !resume ? user?.uid : undefined;
  useEffect(() => {
    if (!uid) return;
    saveLastScreen(uid, pathname, window.scrollY);
    const save = () => saveLastScreen(uid, window.location.pathname, window.scrollY);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
    };
  }, [uid, pathname]);
  // 戻った先で、スクロール位置も戻す
  useResumeScroll(pathname, resumeScroll);

  useEffect(() => {
    if (!ready) return;
    // 停止されたら先にサインアウトし、端末に残した内容も消す（Issue #251。消したあとは読み直して招待状へ）
    if (user && !isActive) {
      void clearDeviceData("/invitation");
      return;
    }
    if (dest && pathname !== dest) router.replace(dest);
  }, [ready, dest, pathname, router, user, isActive]);

  // 遷移が終わるまで同じ画面を出し続けて白画面を挟まない
  if (!ready || !dest || pathname !== dest || (approved && !decided)) {
    return <SplashScreen phase="booting" />;
  }
  return <GuestSessionProvider value={session}>{children}</GuestSessionProvider>;
}
