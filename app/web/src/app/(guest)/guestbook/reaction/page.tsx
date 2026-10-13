"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getJson } from "@/lib/api-client";
import { GuestbookShell } from "@/components/guestbook/GuestbookShell";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";
import { TagChips } from "@/components/guestbook/TagChips";
import { SplashScreen } from "@/components/SplashScreen";
import { GUESTBOOK_PATHS } from "@/config/guestbook";
import { RANKING_ALL_TAG, RANKING_TOP } from "@/config/reaction";
import { tagDef } from "@/config/tags";
import { formatReaction } from "@/lib/opening-names";
import { useTags } from "@/lib/tags-client";
import type { ReactionStatus } from "@/types/invitation";
import type { ReactionRanking, ReactionRankingRow } from "@/types/reaction";

type Loaded = { tag: string; data: ReactionRanking | null; error: string | null };

/**
 * リアクションタイムのランキング（Issue #132）。マイページから開く。
 *
 * ★グループ（タグ）の切り替えは、投稿の公開範囲の選択と同じ部品（TagChips）★
 *   ここでタグの切り替えに慣れてもらう。並びは「全員」→ 自分が持っているコミュニティのタグ。
 *   承認済・新郎新婦・CTF などの仕組み用のタグは出さない。
 * ★見られる範囲はサーバーが決める★ 持っていないタグを指定しても API が 403 を返す。ここの出し分けは使い勝手のため。
 * ★名前はニックネームだけ★ API は本名・uid を返さない。
 */
export default function ReactionRankingPage() {
  const { user, tags, isAdmin } = useGuestSessionContext();
  const { allTags } = useTags();

  const options = useMemo(() => {
    const mine = allTags.filter((t) => t.community && !t.archived && (isAdmin || tags.includes(t.id)));
    return isAdmin || tags.includes(RANKING_ALL_TAG) ? [tagDef(RANKING_ALL_TAG), ...mine] : mine;
  }, [allTags, tags, isAdmin]);

  const [picked, setPicked] = useState<string | null>(null);
  // 選んだタグが一覧に無い（まだ選んでいない・タグが外れた）ときは、先頭を使う
  const tag = picked && options.some((o) => o.id === picked) ? picked : (options[0]?.id ?? null);

  // 結果はタグと一緒に持ち、タグを切り替えたら描画時に「読み込み中」へ戻す
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [myRecord, setMyRecord] = useState<number | null | undefined>(undefined);
  const uid = user?.uid;

  useEffect(() => {
    if (!uid || !tag) return;
    let cancelled = false;
    getJson<ReactionRanking>(`/api/guest/reaction/ranking?tag=${encodeURIComponent(tag)}`)
      .then((data) => {
        if (!cancelled) setLoaded({ tag, data, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoaded({ tag, data: null, error: e instanceof Error ? e.message : "読み込みに失敗しました" });
      });
    return () => {
      cancelled = true;
    };
  }, [uid, tag]);

  // 自分の記録の有無（「挑戦する」を出すかどうか）。ランキングの me は、そのグループにいる人にしか入らない
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getJson<ReactionStatus>("/api/guest/reaction")
      .then((r) => {
        if (!cancelled) setMyRecord(r.reactionMs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!user) return <SplashScreen phase="booting" />;

  const current = loaded && loaded.tag === tag ? loaded : null;
  const data = current?.data ?? null;
  // 自分が上位に入っていなければ、最後に自分の行を足す
  const outOfTop = data?.me && !data.rows.some((r) => r.isMe) ? data.me : null;

  return (
    <GuestbookShell>
      <div className="space-y-4">
        <header>
          <Link href={GUESTBOOK_PATHS.settings} className="-my-3 inline-block py-3 text-xs text-stone-400 hover:text-stone-700">
            ← マイページに戻る
          </Link>
          <h1 className="mt-1 font-serif text-xl text-stone-900">リアクションタイム</h1>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">オープニングで、START の合図から指を離すまでの時間です。記録は1人1回だけ。</p>
        </header>

        {myRecord === null && (
          <div className="rounded-2xl border border-stone-200/80 bg-white p-4 text-center shadow-sm">
            <p className="text-sm text-stone-700">まだ記録がありません。</p>
            <Link
              href={GUESTBOOK_PATHS.opening}
              className="mt-3 inline-flex min-h-11 touch-manipulation items-center justify-center rounded-full bg-stone-900 px-6 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              挑戦する
            </Link>
          </div>
        )}

        {tag === null ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">見られるグループがありません</p>
        ) : (
          <>
            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500">
                グループ
                <span className="ml-1.5 font-normal text-stone-400">{tagDef(tag).label} のランキングを表示しています</span>
              </p>
              {/* 1つだけ選ぶ（選んでいるチップをもう一度押しても外れない） */}
              <TagChips options={options} selected={[tag]} onSelect={setPicked} label="グループ" />
            </div>

            {!current ? (
              <div className="h-40 animate-pulse rounded-2xl bg-stone-200/60" />
            ) : current.error ? (
              <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{current.error}</p>
            ) : !data || data.rows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">このグループには、まだ記録がありません</p>
            ) : (
              <section aria-label={`${tagDef(tag).label} のランキング`}>
                <ol className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
                  {data.rows.map((row, i) => (
                    <RankRow key={i} row={row} />
                  ))}
                  {outOfTop && (
                    <>
                      <li aria-hidden className="py-1 text-center text-xs text-stone-300">⋯</li>
                      <RankRow row={outOfTop} />
                    </>
                  )}
                </ol>
                <p className="mt-2 text-center text-[11px] text-stone-400">
                  記録がある人 {data.total} 人{data.total > RANKING_TOP ? `（上位 ${RANKING_TOP} 人を表示）` : ""}
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </GuestbookShell>
  );
}

/** 1行: 順位・アイコン・ニックネーム・タイム（1/100 秒・切り捨て）。自分の行は色を付ける */
function RankRow({ row }: { row: ReactionRankingRow }) {
  return (
    <li
      aria-current={row.isMe ? "true" : undefined}
      className={`flex min-h-14 items-center gap-3 px-3 py-2 ${row.isMe ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : ""}`}
    >
      <span className={`w-8 shrink-0 text-center tabular-nums ${row.rank <= 3 ? "text-base font-bold text-stone-900" : "text-sm text-stone-500"}`}>
        {row.rank}
        <span className="sr-only">位</span>
      </span>
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-stone-200">
        {row.photoURL && <Image src={row.photoURL} alt="" fill sizes="36px" className="object-cover" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
        {row.nickname}
        {row.isMe && <span className="ml-1.5 rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-medium text-white">あなた</span>}
      </span>
      <span className="shrink-0 text-base font-semibold tabular-nums text-stone-900">
        {formatReaction(row.reactionMs)}
        <span className="ml-0.5 text-xs font-normal text-stone-400">秒</span>
      </span>
    </li>
  );
}
