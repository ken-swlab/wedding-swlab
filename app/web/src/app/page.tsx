"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGuestSession } from "@/hooks/useGuestSession";
import { SplashScreen } from "@/components/SplashScreen";

/**
 * ★ここではログインを開始しない★
 *   以前はこのページを開いた瞬間に LIFF のログインへ飛ばしていた。
 *   /invitation を「誰でも読める招待状」にするため、ログインの起点は
 *   招待状の「出欠を回答する」ボタンへ移した。
 *   このページは行き先を決めるだけにする。
 *
 *   ログイン済みの場合は /guestbook へ送るが、そこで止まるとは限らない。
 *   (guest)/layout.tsx が未登録なら /onboarding、未承認なら /pending へ
 *   さらに振り分ける。行き先の判断は1箇所に集約してある。
 */
export default function Home() {
  const router = useRouter();
  const { user, loading } = useGuestSession();

  useEffect(() => {
    router.prefetch("/invitation");
    router.prefetch("/guestbook");
  }, [router]);

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/guestbook" : "/invitation");
  }, [loading, user, router]);

  // 遷移が終わるまで同じ画面を出し続けて白画面を挟まない
  return <SplashScreen phase="booting" />;
}
