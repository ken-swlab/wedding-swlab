"use client";

import { useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { PostDetail } from "@/components/guestbook/PostDetail";
import { AuthorNameProvider } from "@/components/guestbook/AuthorNameProvider";
import { SplashScreen } from "@/components/SplashScreen";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { useVisualViewportFrame } from "@/hooks/useVisualViewportFrame";
import { GUESTBOOK_PATHS } from "@/config/guestbook";
import { publicName } from "@/lib/names";

/**
 * 投稿の詳細画面。共有された URL やリロードで開いたときに出る。
 * タイムラインのカードから開いたときは、このページではなく PostDetailSheet が重なる。
 * シートと同じく全画面（ヘッダー・ボトムナビ・戻るボタンなし）で、右スワイプで戻る。
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

  // 画面のどこからでも右へスワイプしたら戻る。動かすのは全画面の枠そのもの
  // （枠の中に別の fixed の要素を置かないこと。useSwipeBack の★参照）
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // スプラッシュの間は要素が無いので、本画面を描いてから登録する
  const ready = !!user && !!profile;
  useSwipeBack(frame, frame, back, {
    enabled: ready,
    // ★スクロールする箱の先頭で下へ引く操作を止める★（PostDetail の★参照）
    blockNative: (axis, d) => axis === "y" && d > 0 && (scroller.current?.scrollTop ?? 0) <= 0,
  });
  useVisualViewportFrame(frame, ready);

  // ★振り分けは (guest)/layout.tsx が行う★ ここは承認済みで開ける状態だけを描く
  if (!user || !profile) return <SplashScreen phase="booting" />;

  return (
    <AuthorNameProvider value={publicName(profile)}>
      <div
        ref={frame}
        className="fixed inset-x-0 top-0 z-40 flex h-dvh flex-col bg-white"
        style={{ touchAction: "pan-y" }}
      >
        <PostDetail id={id} user={user} onClose={back} scroller={scroller} />
      </div>
    </AuthorNameProvider>
  );
}
