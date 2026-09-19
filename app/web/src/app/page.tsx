"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiffAuth } from "@/hooks/useLiffAuth";
import { SplashScreen } from "@/components/SplashScreen";

export default function Home() {
  const router = useRouter();
  const { phase, user, message, retry } = useLiffAuth();

  // 認証待ちのあいだに遷移先を温めておく（LINE内ブラウザの体感差が大きい）
  useEffect(() => {
    router.prefetch("/guestbook");
  }, [router]);

  useEffect(() => {
    if (phase === "ready" && user) {
      router.replace("/guestbook");
    }
  }, [phase, user, router]);

  // 遷移が完了するまで同じ画面を出し続けることで白画面を挟まない
  return <SplashScreen phase={phase} message={message} onRetry={retry} />;
}
