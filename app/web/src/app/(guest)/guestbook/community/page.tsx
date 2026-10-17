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
import { COMMUNITY_ALL_TAG } from "@/config/community";
import { RANKING_TOP } from "@/config/reaction";
import { tagDef } from "@/config/tags";
import { formatReaction } from "@/lib/opening-names";
import { useTags } from "@/lib/tags-client";
import type { CommunityMember, CommunityMembers } from "@/types/community";
import type { ReactionStatus } from "@/types/invitation";
import type { ReactionRanking, ReactionRankingRow } from "@/types/reaction";

/** 読み込んだ結果はタグと一緒に持ち、タグを切り替えたら描画時に「読み込み中」へ戻す */
type Loaded<T> = { tag: string; data: T | null; error: string | null };

/** タグを指定して API を読む。タグが変わったら読み直す */
function useByTag<T>(path: string, uid: string | undefined, tag: string | null): Loaded<T> | null {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  useEffect(() => {
    if (!uid || !tag) return;
    let cancelled = false;
    getJson<T>(`${path}?tag=${encodeURIComponent(tag)}`)
      .then((data) => {
        if (!cancelled) setLoaded({ tag, data, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoaded({ tag, data: null, error: e instanceof Error ? e.message : "読み込みに失敗しました" });
      });
    return () => {
      cancelled = true;
    };
  }, [path, uid, tag]);
  return loaded && loaded.tag === tag ? loaded : null;
}

/**
 * コミュニティ（Issue #174）。上からグループの切り替え・仲間（参加予定のメンバー）・ランキング・オープニングへの導線。
 * 以前マイページから開いていたランキング（Issue #132）とオープニングの見返し（Issue #131）をここへ移した。
 *
 * ★グループ（タグ）の切り替えは、投稿の公開範囲の選択と同じ部品（TagChips）★
 *   並びは「全員」→ 自分が持っているコミュニティのタグ。承認済・新郎新婦・CTF などの仕組み用のタグは出さない。
 *   選んだグループは、仲間とランキングの両方に効く。
 * ★「全員」では、仲間は人数だけ、ランキングは本人以外の名前とアイコンを伏せる★ 伏せるのはサーバー（API）。
 * ★見られる範囲はサーバーが決める★ 持っていないタグを指定しても API が 403 を返す。ここの出し分けは使い勝手のため。
 * ★名前はニックネームだけ★ API は本名・uid を返さない。
 * ★仲間をランキングで代用しない★ ランキングには、オープニングをスキップした人が載らず、あとで欠席と答えた人が残る。
 */
export default function CommunityPage() {
  const { user, tags, isAdmin } = useGuestSessionContext();
  const { allTags } = useTags();

  const options = useMemo(() => {
    const mine = allTags.filter((t) => t.community && !t.archived && (isAdmin || tags.includes(t.id)));
    return isAdmin || tags.includes(COMMUNITY_ALL_TAG) ? [tagDef(COMMUNITY_ALL_TAG), ...mine] : mine;
  }, [allTags, tags, isAdmin]);

  const [picked, setPicked] = useState<string | null>(null);
  // 選んだタグが一覧に無い（まだ選んでいない・タグが外れた）ときは、先頭を使う
  const tag = picked && options.some((o) => o.id === picked) ? picked : (options[0]?.id ?? null);

  const uid = user?.uid;
  const members = useByTag<CommunityMembers>("/api/guest/community/members", uid, tag);
  const ranking = useByTag<ReactionRanking>("/api/guest/reaction/ranking", uid, tag);

  // 自分の記録の有無（「挑戦する」を出すかどうか）。ランキングの me は、そのグループにいる人にしか入らない
  const [myRecord, setMyRecord] = useState<number | null | undefined>(undefined);
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

  return (
    <GuestbookShell>
      <div className="space-y-6">
        <header>
          <h1 className="font-serif text-xl text-stone-900">コミュニティ</h1>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">グループを選ぶと、参加予定の仲間とランキングが切り替わります。</p>
        </header>

        {tag === null ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">見られるグループがありません</p>
        ) : (
          <>
            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500">
                グループ
                <span className="ml-1.5 font-normal text-stone-400">{tagDef(tag).label} を表示しています</span>
              </p>
              {/* 1つだけ選ぶ（選んでいるチップをもう一度押しても外れない） */}
              <TagChips options={options} selected={[tag]} onSelect={setPicked} label="グループ" />
            </div>

            <section aria-labelledby="community-members">
              <h2 id="community-members" className="mb-2 text-sm font-medium text-stone-800">
                仲間<span className="ml-1.5 text-xs font-normal text-stone-400">参加予定のメンバー</span>
              </h2>
              <MembersPanel loaded={members} all={tag === COMMUNITY_ALL_TAG} />
            </section>

            <section aria-labelledby="community-ranking">
              <h2 id="community-ranking" className="text-sm font-medium text-stone-800">リアクション選手権</h2>
              <p className="mb-2 mt-0.5 text-xs leading-relaxed text-stone-500">オープニングで、START の合図から指を離すまでの時間です。記録は1人1回だけ。</p>
              {myRecord === null && (
                <div className="mb-3 rounded-2xl border border-stone-200/80 bg-white p-4 text-center shadow-sm">
                  <p className="text-sm text-stone-700">まだ記録がありません。</p>
                  <Link
                    href={GUESTBOOK_PATHS.opening}
                    className="mt-3 inline-flex min-h-11 touch-manipulation items-center justify-center rounded-full bg-stone-900 px-6 text-sm font-medium text-white transition hover:bg-stone-700"
                  >
                    挑戦する
                  </Link>
                </div>
              )}
              <RankingPanel loaded={ranking} label={tagDef(tag).label} />
            </section>
          </>
        )}

        {/* オープニング演出の見返し（Issue #131。マイページから移した） */}
        <Link
          href={GUESTBOOK_PATHS.opening}
          className="flex min-h-11 touch-manipulation items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-white px-4 py-3 shadow-sm transition hover:bg-stone-50"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-stone-800">オープニングをもう一度見る</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">リアクションタイムの記録がまだの方は、ここから挑戦できます（記録は1回だけ）。</span>
          </span>
          <span aria-hidden className="shrink-0 text-stone-400">›</span>
        </Link>
      </div>
    </GuestbookShell>
  );
}

/** 仲間。全員は人数だけ、グループはアイコンとニックネームの一覧 */
function MembersPanel({ loaded, all }: { loaded: Loaded<CommunityMembers> | null; all: boolean }) {
  if (!loaded) return <div className="h-24 animate-pulse rounded-2xl bg-stone-200/60" />;
  if (loaded.error) return <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{loaded.error}</p>;
  const data = loaded.data;
  if (!data) return null;
  if (all) {
    return (
      <div className="rounded-2xl border border-stone-200/80 bg-white p-4 text-center shadow-sm">
        <p className="text-sm text-stone-600">
          参加予定 <strong className="text-2xl font-semibold tabular-nums text-stone-900">{data.count}</strong> 名
        </p>
        <p className="mt-1 text-[11px] text-stone-400">グループを選ぶと、参加予定のメンバーが見られます</p>
      </div>
    );
  }
  const list = data.members ?? [];
  if (list.length === 0) {
    return <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-400">このグループには、まだ参加予定の人がいません</p>;
  }
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-3 shadow-sm">
      <ul className="grid grid-cols-4 gap-x-2 gap-y-3">
        {list.map((m, i) => (
          <MemberCell key={i} member={m} />
        ))}
      </ul>
      <p className="mt-3 text-center text-[11px] text-stone-400">参加予定 {data.count} 名</p>
    </div>
  );
}

function MemberCell({ member }: { member: CommunityMember }) {
  return (
    <li className="flex min-w-0 flex-col items-center text-center">
      <span className="relative h-12 w-12 overflow-hidden rounded-full bg-stone-200">
        {member.photoURL && <Image src={member.photoURL} alt="" fill sizes="48px" className="object-cover" />}
      </span>
      <span className="mt-1 w-full truncate text-[11px] text-stone-700">{member.nickname}</span>
      {member.secondOnly && <span className="text-[10px] leading-tight text-stone-400">2次会から</span>}
    </li>
  );
}

/** ランキング（Issue #132 の画面から移した） */
function RankingPanel({ loaded, label }: { loaded: Loaded<ReactionRanking> | null; label: string }) {
  if (!loaded) return <div className="h-40 animate-pulse rounded-2xl bg-stone-200/60" />;
  if (loaded.error) return <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{loaded.error}</p>;
  const data = loaded.data;
  if (!data || data.rows.length === 0) {
    return <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">このグループには、まだ記録がありません</p>;
  }
  // 自分が上位に入っていなければ、最後に自分の行を足す
  const outOfTop = data.me && !data.rows.some((r) => r.isMe) ? data.me : null;
  return (
    <div aria-label={`${label} のランキング`}>
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
        {data.anonymous ? "。全員のランキングでは、名前を伏せています" : ""}
      </p>
    </div>
  );
}

/**
 * 1行: 順位・アイコン・ニックネーム・タイム（1/100 秒・切り捨て）。自分の行は色を付ける。
 * 名前を伏せた行（「全員」の本人以外。nickname が空）は、アイコンを灰色の丸にし、名前を出さない。
 */
function RankRow({ row }: { row: ReactionRankingRow }) {
  const hidden = !row.isMe && !row.nickname;
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
        {hidden ? (
          <span className="text-stone-300">
            ―<span className="sr-only">（名前は伏せています）</span>
          </span>
        ) : (
          row.nickname
        )}
        {row.isMe && <span className="ml-1.5 rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-medium text-white">あなた</span>}
      </span>
      <span className="shrink-0 text-base font-semibold tabular-nums text-stone-900">
        {formatReaction(row.reactionMs)}
        <span className="ml-0.5 text-xs font-normal text-stone-400">秒</span>
      </span>
    </li>
  );
}
