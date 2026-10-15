import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { parseWelcomeConfig, pickWelcome } from "@/lib/welcome-config";
import { WELCOME_DEFAULT_MESSAGE } from "@/config/welcome";
import type { WelcomeContent, WelcomeStatus } from "@/types/welcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

type Caller = { uid: string; tags: string[] };

/** 本人確認（失効チェック付き）と、承認済みかの確認。だめなら応答を返す */
async function caller(req: Request): Promise<Caller | NextResponse> {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);
  let uid: string;
  let tags: string[];
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    uid = decoded.uid;
    tags = Array.isArray(decoded.tags) ? (decoded.tags as string[]) : [];
  } catch {
    return fail("ログインし直してください", 401);
  }
  const publicSnap = await db.collection("guests").doc(uid).get();
  if (publicSnap.get("isApproved") !== true || tags.length === 0) return fail("承認後にご覧いただけます", 403);
  return { uid, tags };
}

/**
 * 表示する投稿を決める。config/welcome が未設定・壊れている・投稿が見えないときは仮の画像（postId: null）。
 * ★その人に見える投稿だけを返す★ status が visible で、visibleToTags が本人のタグと重なるもの
 *   （Rules の canSee と同じ条件）。見えない投稿の中身をこの API から漏らさない。
 */
async function content(tags: string[]): Promise<WelcomeContent> {
  const { db } = admin();
  const placeholder = (message: string): WelcomeContent => ({
    postId: null,
    message: message || WELCOME_DEFAULT_MESSAGE,
    media: null,
    reactionCount: 0,
    authorPhotoURL: null,
  });

  const snap = await db.collection("config").doc("welcome").get();
  if (!snap.exists) return placeholder("");
  const parsed = parseWelcomeConfig(snap.data());
  if (!parsed.ok) {
    console.error(`[guest/welcome] config/welcome の形が違います（項目: ${parsed.field}）`);
    return placeholder("");
  }
  const pick = pickWelcome(parsed.value, tags);
  if (!pick.postId) return placeholder(pick.message);

  const post = await db.collection("posts").doc(pick.postId).get();
  const visibleTo = post.get("visibleToTags");
  const media = post.get("media");
  const image = Array.isArray(media) ? media.find((m) => m && m.type === "image") : null;
  const visible =
    post.exists &&
    post.get("status") === "visible" &&
    Array.isArray(visibleTo) &&
    visibleTo.some((t: unknown) => typeof t === "string" && tags.includes(t));
  if (!visible || !image) {
    console.error("[guest/welcome] config/welcome の投稿が見つからないか、このゲストに見えないため仮の画像を出します");
    return placeholder(pick.message);
  }
  const photo = post.get("authorPhotoURL");
  return {
    postId: post.id,
    message: pick.message || WELCOME_DEFAULT_MESSAGE,
    media: { storagePath: typeof image.storagePath === "string" ? image.storagePath : "", url: typeof image.url === "string" ? image.url : "" },
    reactionCount: typeof post.get("reactionCount") === "number" ? post.get("reactionCount") : 0,
    authorPhotoURL: typeof photo === "string" && photo ? photo : null,
  };
}

/**
 * GET: 演出を出すか（Issue #150）。
 * ★出すのは、承認のときに welcomeDueAt が付き、まだ welcomeSeenAt が無い人だけ★
 *   welcomeDueAt は /api/admin/update-guest が承認のときに付ける。この仕組みより前に承認された人には付かない
 *   （オーナーの判断: これから承認される人だけ）。どちらも guestPrivate（本人と管理者だけが読める）。
 */
async function _GET(req: Request) {
  try {
    const c = await caller(req);
    if (c instanceof NextResponse) return c;
    const priv = await admin().db.collection("guestPrivate").doc(c.uid).get();
    const show = priv.get("welcomeDueAt") != null && priv.get("welcomeSeenAt") == null;
    const res: WelcomeStatus = { show, content: show ? await content(c.tags) : null };
    return NextResponse.json({ ok: true, ...res }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[guest/welcome] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * POST: 演出を出したことを記録する（welcomeSeenAt）。★端末を変えても二度出さない★
 *   演出を始めた時点で呼ぶ（途中で閉じても、もう一度は出さない）。最初の1回の時刻だけを残す。
 */
async function _POST(req: Request) {
  try {
    const c = await caller(req);
    if (c instanceof NextResponse) return c;
    const { db } = admin();
    const ref = db.collection("guestPrivate").doc(c.uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.get("welcomeSeenAt") != null) return;
      tx.set(ref, { welcomeSeenAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[guest/welcome] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   ハンドラの中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const GET = withGuard({ name: "guest.welcome", auth: "user", rateLimit: { key: "uid", limit: 30, windowSec: 60 } }, _GET);
export const POST = withGuard(
  { name: "guest.welcome.seen", auth: "user", rateLimit: { key: "uid", limit: 10, windowSec: 60 }, audit: { action: "welcome.seen", target: (_b, uid) => uid } },
  _POST,
);
