"use client";

import { useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { PostDetail } from "@/components/guestbook/PostDetail";
import { AuthorNameProvider } from "@/components/guestbook/AuthorNameProvider";
import { GuestbookShell } from "@/components/guestbook/GuestbookShell";
import { SplashScreen } from "@/components/SplashScreen";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { GUESTBOOK_PATHS } from "@/config/guestbook";
import { publicName } from "@/lib/names";

/**
 * 投稿の詳細画面。共有された URL やリロードで開いたときに出る。
 * タイムラインのカードから開いたときは、このページではなく PostDetailSheet が重なる。
 */
export default function PostDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useGuestSessionContext();

  const back = useCallback(() => {
    // 共有された URL を直接開いたときは戻り先が無いので、タイムラインへ送る
    if (window.history.length > 1) router.back();
    else router.push(GUESTBOOK_PATHS.home);
  }, [router]);

  // 画面のどこからでも右へスワイプしたら戻る。動かすのは本文だけ（useSwipeBack の★参照）
  const screen = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  // スプラッシュの間は要素が無いので、本画面を描いてから登録する
  useSwipeBack(screen, body, back, { enabled: !!user && !!profile });

  // ★振り分けは (guest)/layout.tsx が行う★ ここは承認済みで開ける状態だけを描く
  if (!user || !profile) return <SplashScreen phase="booting" />;

  return (
    <AuthorNameProvider value={publicName(profile)}>
      <div ref={screen} style={{ touchAction: "pan-y" }}>
        <GuestbookShell>
          <div ref={body}>
            <PostDetail id={id} user={user} onBack={back} />
          </div>
        </GuestbookShell>
      </div>
    </AuthorNameProvider>
  );
}
