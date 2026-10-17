import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { COMMUNITY_ALL_TAG, COMMUNITY_GUEST_LIMIT } from "@/config/community";
import { TAG_DEFS, isCustomTagId } from "@/config/tags";
import type { CommunityMember, CommunityMembers } from "@/types/community";

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
    console.error("[guest/community/members] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * 仲間（参加予定のメンバー）。GET ?tag=<tagId>（Issue #174）
 *
 * ★見られるのは、自分が持っているタグの仲間だけ★
 *   タグは ID トークンの Custom Claims（tags）で確かめる。持っていなければ 403。管理者はすべてのタグを見られる。
 *   ランキング（/api/guest/reaction/ranking）と同じ考え方。
 * ★承認前の人は 403★
 * ★「全員」（all）は人数だけ★ 名前・アイコンは返さない（知らない人の出欠まで見えてしまうため）。
 * ★返すのは ニックネーム・アイコン・2次会のみか だけ★
 *   本名・LINE の表示名・uid・LINE のユーザー ID・アレルギー・会費は返さない。
 *   出欠は guestPrivate にあるので、ここで Admin SDK で読んで絞り込むだけ（出欠そのものは返さない）。Rules の変更は不要。
 * ★対象は、そのタグを持つ承認済みのゲストのうち、出欠が「欠席」以外の人★
 *   アクセス停止の人はタグが空になるので入らない。停止の印（isActive === false）も念のため除く。
 *   仮登録（名簿だけの行）・統合済みの行も入れない（ランキングと同じ）。
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

  if (!isAdmin && !myTags.includes(APPROVED_TAG)) return fail("承認されると、仲間を見られるようになります", 403);
  if (!isAdmin && !myTags.includes(tag)) return fail("このグループの仲間は見られません", 403);

  const privateSnap = await db.collection("guestPrivate").doc(uid).get();
  if (privateSnap.get("isActive") === false) return fail("このアカウントはご利用いただけません", 403);

  // そのタグを持つゲスト（公開プロフィール）。1つの式の人数なので、毎回集計する
  const guests = await db.collection("guests").where("tags", "array-contains", tag).limit(COMMUNITY_GUEST_LIMIT).get();
  const candidates = guests.docs.filter(
    (d) => d.get("isApproved") === true && d.get("isRegistered") === true && d.get("isArchived") !== true && !d.get("mergedInto"),
  );
  const privates = candidates.length > 0 ? await db.getAll(...candidates.map((d) => db.collection("guestPrivate").doc(d.id))) : [];

  const members: CommunityMember[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const attendance: unknown = privates[i].get("attendance");
    if (attendance === "declined" || privates[i].get("isActive") === false) continue;
    const nickname: unknown = candidates[i].get("nickname");
    const photoURL: unknown = candidates[i].get("photoURL");
    members.push({
      nickname: typeof nickname === "string" && nickname.trim() ? nickname.trim() : "ゲスト",
      photoURL: typeof photoURL === "string" ? photoURL : "",
      secondOnly: attendance === "second_only",
    });
  }

  // ★全員は人数だけ★
  if (tag === COMMUNITY_ALL_TAG) {
    const res: CommunityMembers = { tag, count: members.length };
    return NextResponse.json({ ok: true, ...res }, { headers: { "Cache-Control": "private, no-store" } });
  }
  members.sort((a, b) => Number(a.secondOnly) - Number(b.secondOnly) || a.nickname.localeCompare(b.nickname, "ja"));
  const res: CommunityMembers = { tag, count: members.length, members };
  return NextResponse.json({ ok: true, ...res }, { headers: { "Cache-Control": "private, no-store" } });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   handle の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const GET = withGuard({ name: "guest.community.members", auth: "user", rateLimit: { key: "uid", limit: 30, windowSec: 60 } }, _GET);
