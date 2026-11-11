import { NextResponse } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { loadCommunityGroup, validReactionMs } from "@/lib/community-server";
import { buildCommunityView } from "@/lib/community-view";
import { COMMUNITY_ALL_TAG } from "@/config/community";
import { RANKING_TOP } from "@/config/reaction";
import { TAG_DEFS, isCustomTagId } from "@/config/tags";
import type { CommunityResponse } from "@/types/community";

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
    console.error("[guest/community] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * コミュニティ（Issue #174・#286）。GET ?tag=<tagId> で、仲間・ランキング・自分の記録をまとめて返す。
 * 以前の3本（/api/guest/community/members・/api/guest/reaction/ranking・/api/guest/reaction の GET）を1本にした。
 *
 * ★アクセス権の確認は、使い回しの前に毎回行う★（Issue #286）トークン（失効チェック付き）→ 承認済み → そのタグを持つ
 *   → 停止されていない。通った人にだけ、使い回しの集計（lib/community-server.ts）から作った応答を返す。
 *   持っていないタグは、集計を使い回していても 403。管理者はすべてのタグを見られる。
 * ★返す中身は今までのルールのまま★（lib/community-view.ts）ニックネーム・アイコン・順位・タイム・2次会のみか・自分かどうかだけ。
 *   uid・本名・LINE の情報・アレルギー・出欠の値は返さない。「全員」は仲間を人数だけにし、ランキングは本人以外を伏せる。
 * ★自分の記録は毎回1件だけ読む★ 使い回しの古さに関係なく、自分の記録と順位を正しく出す。
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
  if (!isAdmin && !myTags.includes(APPROVED_TAG)) return fail("承認されると、コミュニティを見られるようになります", 403);
  if (!isAdmin && !myTags.includes(tag)) return fail("このグループは見られません", 403);

  // 本人の停止の確認・本人の記録・本人の公開プロフィールと、タグの集計（使い回し）を同時に読む
  const [privateSnap, mineSnap, selfSnap, group] = await Promise.all([
    db.collection("guestPrivate").doc(uid).get(),
    db.collection("reactionTimes").doc(uid).get(),
    db.collection("guests").doc(uid).get(),
    loadCommunityGroup(tag),
  ]);
  // ★停止の確認は、応答を作る前に毎回★
  if (privateSnap.get("isActive") === false) return fail("このアカウントはご利用いただけません", 403);

  const ms: unknown = mineSnap.get("reactionMs");
  const at = mineSnap.get("recordedAt") as Timestamp | undefined;
  const mine = mineSnap.exists && validReactionMs(ms) ? { reactionMs: ms, recordedAtMs: at?.toMillis?.() ?? Date.now() } : null;
  const nicknameRaw: unknown = selfSnap.get("nickname");
  const photoRaw: unknown = selfSnap.get("photoURL");
  // そのグループの一員か（そのタグを持つ承認済み・登録済みの人。管理者がほかのタグを見るときは false）
  const inGroup = myTags.includes(tag) && selfSnap.get("isApproved") === true && selfSnap.get("isRegistered") === true;

  const view = buildCommunityView({
    group,
    tag,
    allTag: COMMUNITY_ALL_TAG,
    top: RANKING_TOP,
    uid,
    inGroup,
    mine,
    self: {
      nickname: typeof nicknameRaw === "string" && nicknameRaw.trim() ? nicknameRaw.trim() : "ゲスト",
      photoURL: typeof photoRaw === "string" ? photoRaw : "",
    },
  });
  const res: CommunityResponse = view;
  return NextResponse.json({ ok: true, ...res }, { headers: { "Cache-Control": "private, no-store" } });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   handle の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。レート制限は1リクエストに1回
export const GET = withGuard({ name: "guest.community", auth: "user", rateLimit: { key: "uid", limit: 30, windowSec: 60 } }, _GET);
