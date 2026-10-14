"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getJson, postJson } from "@/lib/api-client";
import { Opening } from "@/components/opening/Opening";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { SplashScreen } from "@/components/SplashScreen";
import { GUESTBOOK_PATHS } from "@/config/guestbook";
import { OPENING_NOTE } from "@/config/invitation";
import { formatReaction, openingCast } from "@/lib/opening-names";
import { markOpeningSeen } from "@/lib/opening-seen";
import type { InvitationStatus, OpeningContent, ReactionStatus } from "@/types/invitation";

type View =
  | { kind: "loading" }
  | { kind: "unavailable" }
  /** recordedMs: すでにある記録（無ければ null = これから一発勝負） */
  | { kind: "ready"; opening: OpeningContent; recordedMs: number | null }
  | { kind: "playing"; opening: OpeningContent; recordedMs: number | null }
  | { kind: "error"; message: string };

/**
 * マイページから開くオープニング（Issue #131）。
 *   - 記録がある人: 「オープニングをもう一度見る」。計測はするが記録しない（表示だけ）。
 *   - 記録が無い人（スキップした・反応なしだった）: 一発勝負に挑戦できる。記録は1回だけ。
 * ★記録の上書きはサーバーが断る★（/api/guest/reaction）。ここで出し分けているのは案内の文言だけ。
 * ★始める前に確認の画面を挟む★ 一発勝負なので、うっかり開いて記録が決まらないようにする。
 */
export default function OpeningReplayPage() {
  const router = useRouter();
  const { user } = useGuestSessionContext();
  const [view, setView] = useState<View>({ kind: "loading" });
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    Promise.all([getJson<InvitationStatus>("/api/guest/invitation"), getJson<ReactionStatus>("/api/guest/reaction")])
      .then(([inv, reaction]) => {
        if (cancelled) return;
        if (!inv.ready || !inv.opening) setView({ kind: "unavailable" });
        else setView({ kind: "ready", opening: inv.opening, recordedMs: reaction.reactionMs });
      })
      .catch((e: unknown) => {
        if (!cancelled) setView({ kind: "error", message: e instanceof Error ? e.message : "読み込みに失敗しました" });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!user || view.kind === "loading") return <SplashScreen phase="booting" />;

  if (view.kind === "playing") {
    const cast = openingCast(user.displayName, view.opening.names);
    const challenge = view.recordedMs === null;
    return (
      <Opening
        couple={cast.couple}
        guestName={cast.guestName}
        date={view.opening.date}
        venue={view.opening.venue}
        note={challenge ? OPENING_NOTE.record : OPENING_NOTE.replay}
        onReaction={(reactionMs) => {
          if (!challenge) return;
          postJson("/api/guest/reaction", { reactionMs }).catch((e: unknown) => console.error("[opening] リアクションタイムの保存に失敗しました", e));
        }}
        onFinish={() => {
          markOpeningSeen();
          router.replace(GUESTBOOK_PATHS.settings);
        }}
      />
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-stone-50 px-6 text-center" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
      <div className="w-full max-w-sm rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
        {view.kind === "ready" ? (
          <>
            <h1 className="font-serif text-lg text-stone-900">オープニング</h1>
            {view.recordedMs !== null ? (
              <p className="mt-3 text-sm leading-relaxed text-stone-600">
                あなたのリアクションタイムは <strong className="text-base tabular-nums text-stone-900">{formatReaction(view.recordedMs)}</strong> 秒です。
                <br />
                もう一度見ても、記録は変わりません。
              </p>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-stone-600">
                リアクションタイムの記録がまだありません。
                <br />
                <strong className="text-stone-900">記録できるのは1回だけ</strong>です。START の合図で指を離してください。
              </p>
            )}
            <p className="mt-2 text-xs text-stone-400">音は出ません。1分ほどで終わります。</p>
            <button
              type="button"
              onClick={() => setView({ ...view, kind: "playing" })}
              className="mt-5 min-h-11 w-full touch-manipulation rounded-full bg-stone-900 px-4 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              {view.recordedMs !== null ? "もう一度見る" : "挑戦する"}
            </button>
          </>
        ) : (
          <p role="alert" className="text-sm leading-relaxed text-stone-600">
            {view.kind === "unavailable" ? "オープニングは、ただいま準備中です。" : view.message}
          </p>
        )}
        <Link href={GUESTBOOK_PATHS.settings} className="mt-3 inline-flex min-h-11 items-center px-4 text-sm text-stone-500">
          マイページに戻る
        </Link>
      </div>
    </main>
  );
}
