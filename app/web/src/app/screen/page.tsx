"use client";

import { useCallback, useEffect, useState } from "react";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useScreenData } from "@/hooks/useScreenData";
import { PhotoStage } from "@/components/screen/PhotoStage";
import { CommentStream } from "@/components/screen/CommentStream";
import { SCREEN_TAGS } from "@/config/screen";

export default function ScreenPage() {
  const { user, tags, isAdmin, loading } = useGuestSession();
  const { cells, spotlight, settle, messages, retireMessage, ready, error, queued } =
    useScreenData();
  const [idle, setIdle] = useState(false);

  const allowed = isAdmin || tags.length > 0;

  /**
   * ★披露宴の3時間、画面を絶対に消さない★
   * タブが裏に回ると解放されるので visibilitychange で取り直す。
   */
  useEffect(() => {
    if (!allowed) return;
    let lock: { release: () => Promise<void> } | null = null;

    const acquire = async () => {
      try {
        const wl = (navigator as Navigator & {
          wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
        }).wakeLock;
        if (wl) lock = await wl.request("screen");
      } catch {
        /* 非対応ブラウザでは黙って諦める */
      }
    };
    void acquire();

    const onVis = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, [allowed]);

  // 操作が止まったらカーソルとUIを隠す
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 4000);
    };
    reset();
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  if (loading) {
    return <main className="h-[100dvh] w-screen bg-black" />;
  }

  if (!user || !allowed) {
    return (
      <main className="flex h-[100dvh] w-screen items-center justify-center bg-black px-8 text-center">
        <div className="max-w-sm">
          <h1 className="font-serif text-xl tracking-[0.2em] text-white/90">SCREEN</h1>
          <p className="mt-4 text-sm leading-relaxed text-white/50">
            投影用の画面です。
            <br />
            先に <code className="text-white/70">/</code> から LINE ログインし、
            承認済みのアカウントで開いてください。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`relative h-[100dvh] w-screen overflow-hidden bg-[#0a0a0b] ${
        idle ? "cursor-none" : ""
      }`}
    >
      <PhotoStage cells={cells} spotlight={spotlight} onSettled={settle} />
      <CommentStream messages={messages} onRetire={retireMessage} />

      {/* 待機中のプレースホルダ */}
      {ready && cells.every((c) => c === null) && !spotlight && (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
          <div className="text-center">
            <h1 className="font-serif text-[5vh] tracking-[0.3em] text-white/80">
              GUEST BOOK
            </h1>
            <div className="mx-auto mt-5 h-px w-16 bg-white/25" />
            <p className="mt-5 text-[2.2vh] text-white/40">
              みなさまのお写真をお待ちしています
            </p>
          </div>
        </div>
      )}

      {/* 操作中だけ出るコントロール */}
      <div
        className={`fixed bottom-4 right-4 z-40 flex items-center gap-3 transition-opacity duration-500 ${
          idle ? "opacity-0" : "opacity-100"
        }`}
      >
        {error && (
          <span className="rounded-full bg-rose-900/80 px-3 py-1.5 text-xs text-rose-100">
            {error.code === "failed-precondition"
              ? "インデックス作成中です"
              : `読み込みエラー (${error.code})`}
          </span>
        )}
        {queued > 0 && (
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs tabular-nums text-white/60">
            待機 {queued}
          </span>
        )}
        <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/40">
          投影対象: {SCREEN_TAGS.join(", ")}
        </span>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/70 hover:bg-white/20"
        >
          全画面
        </button>
      </div>
    </main>
  );
}
