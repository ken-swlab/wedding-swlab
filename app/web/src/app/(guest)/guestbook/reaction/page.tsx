"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SplashScreen } from "@/components/SplashScreen";
import { GUESTBOOK_PATHS } from "@/config/guestbook";

/**
 * 以前のランキングの画面（Issue #132）。Issue #174 でコミュニティ（/guestbook/community）へ移した。
 * ★残しているのは、古いリンク・ブックマークから来た人をコミュニティへ送るためだけ★
 */
export default function ReactionRankingRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(GUESTBOOK_PATHS.community);
  }, [router]);
  return <SplashScreen phase="booting" />;
}
