import { NextResponse } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { rankEntries } from "@/lib/reaction-ranking";
import { REACTION_MAX_MS, REACTION_MIN_MS } from "@/config/opening";
import { RANKING_ALL_TAG, RANKING_GUEST_LIMIT, RANKING_TOP } from "@/config/reaction";
import { TAG_DEFS, isCustomTagId } from "@/config/tags";
import type { ReactionRanking, ReactionRankingRow } from "@/types/reaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/** 承認済みのゲストが持つタグ（update-guest が承認のときに付ける） */
const APPROVED_TAG = "guest";
const KNOWN_TAGS = new Set(TAG_DEFS.map((t) => t.id));

async function _GET(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[guest/reaction/ranking] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * リアクションタイムのランキング（Issue #132）。GET ?tag=<tagId>
 *
 * ★見られるのは、自分が持っているタグのランキングだけ★
 *   タグは ID トークンの Custom Claims（tags）で確かめる。持っていなければ 403。管理者はすべてのタグを見られる。
 *   投稿の公開範囲と同じ考え方（見える範囲はタグで決まる）。
 * ★承認前の人は 403★ 承認前に見られるのは自分のタイムだけ（GET /api/guest/reaction）。
 * ★返すのは 順位・ニックネーム・アイコン・タイム・自分かどうか だけ★
 *   本名・LINE の表示名・uid・LINE のユーザー ID は返さない（guests から読むのは公開プロフィールの項目だけ）。
 * ★「全員」（all）のときは、本人以外の名前とアイコンを伏せる★（Issue #174）
 *   全員のランキングは、知らない人の名前まで並んでしまう。順位とタイムだけを返し、本人の行だけ isMe で目立たせる。
 *   伏せるのはサーバーで行う（画面で隠すだけにしない）。
 * ★対象は、そのタグを持つ承認済みのゲストのうち、記録がある人★
 *   アクセス停止の人はタグが空になるので入らない。仮登録（名簿だけの行）・統合済みの行も入れない。
 * reactionTimes はクライアントから読めない（Rules の既定の拒否）。ここで Admin SDK で読む。Rules の変更は不要。
 */
async function handle(req: Request) {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  let uid: string;
  let isAdmin: boolean;
  let myTags: string[];
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    uid = decoded.uid;
    isAdmin = decoded.admin === true;
    myTags = Array.isArray(decoded.tags) ? (decoded.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
  } catch {
    return fail("ログインし直してください", 401);
  }

  // ★形の確認が先★ URL の値をそのままクエリに渡さない
  const tag = new URL(req.url).searchParams.get("tag") ?? "";
  if (!KNOWN_TAGS.has(tag) && !isCustomTagId(tag)) return fail("グループの指定が正しくありません", 400);

  if (!isAdmin && !myTags.includes(APPROVED_TAG)) return fail("承認されると、ランキングを見られるようになります", 403);
  if (!isAdmin && !myTags.includes(tag)) return fail("このグループのランキングは見られません", 403);

  const privateSnap = await db.collection("guestPrivate").doc(uid).get();
  if (privateSnap.get("isActive") === false) return fail("このアカウントはご利用いただけません", 403);

  // そのタグを持つゲスト（公開プロフィール）。1つの式の人数なので、毎回集計する
  const guests = await db.collection("guests").where("tags", "array-contains", tag).limit(RANKING_GUEST_LIMIT).get();
  const members = guests.docs.filter(
    (d) => d.get("isApproved") === true && d.get("isRegistered") === true && d.get("isArchived") !== true && !d.get("mergedInto"),
  );
  const times = members.length > 0 ? await db.getAll(...members.map((d) => db.collection("reactionTimes").doc(d.id))) : [];

  const entries = [];
  for (let i = 0; i < members.length; i++) {
    const ms: unknown = times[i].get("reactionMs");
    // 壊れた値は並べない
    if (typeof ms !== "number" || !Number.isInteger(ms) || ms < REACTION_MIN_MS || ms > REACTION_MAX_MS) continue;
    const at = times[i].get("recordedAt") as Timestamp | undefined;
    const nickname: unknown = members[i].get("nickname");
    const photoURL: unknown = members[i].get("photoURL");
    entries.push({
      uid: members[i].id,
      reactionMs: ms,
      recordedAtMs: at?.toMillis?.() ?? 0,
      nickname: typeof nickname === "string" && nickname.trim() ? nickname.trim() : "ゲスト",
      photoURL: typeof photoURL === "string" ? photoURL : "",
    });
  }

  // ★uid はここで落とす★ 応答には入れない
  const ranked = rankEntries(entries);
  const anonymous = tag === RANKING_ALL_TAG;
  const toRow = (r: (typeof ranked)[number]): ReactionRankingRow => {
    const isMe = r.uid === uid;
    const hide = anonymous && !isMe;
    return { rank: r.rank, nickname: hide ? "" : r.nickname, photoURL: hide ? "" : r.photoURL, reactionMs: r.reactionMs, isMe };
  };
  const mine = ranked.find((r) => r.uid === uid);
  const res: ReactionRanking = {
    tag,
    anonymous,
    total: ranked.length,
    rows: ranked.slice(0, RANKING_TOP).map(toRow),
    me: mine ? toRow(mine) : null,
  };
  return NextResponse.json({ ok: true, ...res }, { headers: { "Cache-Control": "private, no-store" } });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   handle の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const GET = withGuard({ name: "guest.reaction.ranking", auth: "user", rateLimit: { key: "uid", limit: 30, windowSec: 60 } }, _GET);
