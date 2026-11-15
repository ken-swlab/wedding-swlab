import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { POST_ID_RE } from "@/config/guestbook";
import { MAX_VISIBLE_TAGS, POSTS_VISIBILITY_API_PATH_RE } from "@/config/post-edit";
import { COUPLE_TAG } from "@/config/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 1 回のバッチで書く件数（Firestore の上限は 500） */
const BATCH_SIZE = 400;
/** 本人のエピソードを探すときの上限（/api/episodes の MAX_PER_GUEST は 50） */
const EPISODE_SCAN_LIMIT = 200;
/** タグ ID の長さの上限（組み込みのタグ・c_ + 8 桁のカスタムタグより十分長い） */
const MAX_TAG_ID_LENGTH = 40;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/** URL のパス（/api/posts/{id}/visibility）から投稿の ID を取り出す。★形を確かめてから doc() に渡す★ */
function postIdOf(req: Request): string | null {
  const id = POSTS_VISIBILITY_API_PATH_RE.exec(new URL(req.url).pathname)?.[1] ?? "";
  return POST_ID_RE.test(id) ? id : null;
}

const sameTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

async function _PUT(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[posts/visibility] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * 投稿したあとに、自分の投稿の公開範囲を変える（Issue #300）。
 *
 * ★本人の投稿だけ★ 管理者でも他人の投稿は変えない（管理者は /api/admin/posts/visibility の非表示だけ）。
 * ★投稿・その全コメント・お題から作ったエピソードの visibleToTags を、サーバーがまとめて書き換える★
 *   コメントは投稿の範囲を写して持ち（Rules の validComment は親と完全一致を求める）、コメントの横断購読（/screen）は
 *   コメント自身の範囲だけで判定する。投稿だけ変えると、コメントが古い範囲のまま残って購読からはみ出す。
 *   ブラウザからの posts の visibleToTags の update は、引き続き Rules で禁止している。
 * ★書く順番は、途中で失敗しても「見える人が少ない側」に倒す★
 *   狭める（今の範囲から1つでも外す）ときは、先にコメント・エピソード → 最後に投稿。
 *   広げるだけのときは、先に投稿 → あとでコメント・エピソード。
 *   最後に、投稿を書き換える前に古い範囲で付いたコメントが無いか読み直し、残っていれば直す。
 * ★選べるタグは投稿のときと同じ★（Rules の tagsInMyScope）自分のタグだけ、新郎新婦は ['couple'] ちょうどのときだけ。
 * ★非表示（hidden）の投稿は変えない★（非表示は visibleToTags を空にして作っている。変えると非表示が解ける）
 * メンションの通知は送り直さない。範囲の外になった相手からは見えなくなるだけ。
 * 公開バケットの写真の URL は消さない（範囲を狭めても、すでに見た人・保存した人の分は取り消せない。画面の注意書きの根拠）。
 */
async function handle(req: Request) {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  let uid: string;
  let myTags: string[];
  let isAdmin: boolean;
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    uid = decoded.uid;
    isAdmin = decoded.admin === true;
    myTags = Array.isArray(decoded.tags) ? (decoded.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
  } catch {
    return fail("ログインし直してください", 401);
  }
  if (myTags.length === 0 && !isAdmin) return fail("新郎新婦の承認後にご利用いただけます", 403);

  const postId = postIdOf(req);
  if (!postId) return fail("リクエストが不正です", 400);

  let body: { visibleToTags?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("リクエストが不正です", 400);
  }
  if (!Array.isArray(body.visibleToTags)) return fail("リクエストが不正です", 400);
  const raw = body.visibleToTags as unknown[];
  if (raw.some((t) => typeof t !== "string" || !t || t.length > MAX_TAG_ID_LENGTH)) {
    return fail("公開範囲のタグが不正です", 400);
  }
  const next = [...new Set(raw as string[])];
  if (next.length === 0) return fail("公開範囲を1つ以上選んでください", 400);
  if (next.length > MAX_VISIBLE_TAGS) return fail("公開範囲が多すぎます", 400);

  // ★Rules の tagsInMyScope と同じ★ 管理者はどの範囲でもよい（Rules と同じ）
  const coupleOnly = next.length === 1 && next[0] === COUPLE_TAG;
  if (!isAdmin && !coupleOnly) {
    if (next.includes(COUPLE_TAG)) return fail("「新郎新婦」は、ほかの公開範囲と一緒には選べません", 400);
    if (next.some((t) => !myTags.includes(t))) return fail("ご自身が属していない公開範囲は選べません", 403);
  }

  const postRef = db.collection("posts").doc(postId);
  const snap = await postRef.get();
  // 見つからない・他人の投稿は区別しない（他人の投稿の有無を探らせない）
  if (!snap.exists || snap.get("authorUid") !== uid) return fail("変更できない投稿です", 403);
  if (snap.get("status") !== "visible") return fail("非表示の投稿は変更できません", 403);
  const prev = ((snap.get("visibleToTags") as unknown[] | undefined) ?? []).filter((t): t is string => typeof t === "string");
  if (sameTags(prev, next)) return NextResponse.json({ ok: true, changed: false });

  const narrowing = prev.some((t) => !next.includes(t));
  const text = String(snap.get("text") ?? "");

  /** 投稿を書き換える。★書く直前にもう一度、本人の・表示中の投稿か確かめる★（その間に非表示にされたら書かない） */
  async function writePost(): Promise<boolean> {
    return db.runTransaction(async (tx) => {
      const cur = await tx.get(postRef);
      if (!cur.exists || cur.get("authorUid") !== uid || cur.get("status") !== "visible") return false;
      tx.update(postRef, { visibleToTags: next, updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
  }

  /** コメント・エピソードのうち、範囲が next と違うものを書き換える。書いた件数を返す */
  async function writeChildren(): Promise<{ comments: number; episodes: number }> {
    const comments = await postRef.collection("comments").get();
    // 非表示のコメント（hidden。投稿の非表示と一緒に付く）は触らない
    const staleComments = comments.docs.filter(
      (c) => c.get("hidden") !== true && !sameTags((c.get("visibleToTags") as string[] | undefined) ?? [], next),
    );
    // ★エピソードは postId で結ぶ★ postId を残す前（Issue #300 より前）に作ったものは、本人の・本文が同じもので結ぶ
    const episodes = await db.collection("episodes").where("authorUid", "==", uid).limit(EPISODE_SCAN_LIMIT).get();
    const staleEpisodes = episodes.docs.filter((d) => {
      const linked = d.get("postId") === postId || (!d.get("postId") && text !== "" && d.get("originalText") === text);
      return linked && !sameTags((d.get("visibleToTags") as string[] | undefined) ?? [], next);
    });

    const refs = [...staleComments.map((c) => c.ref), ...staleEpisodes.map((d) => d.ref)];
    for (let i = 0; i < refs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const ref of refs.slice(i, i + BATCH_SIZE)) {
        // エピソードの updatedAt は数値（Date.now()）、コメントには updatedAt が無い（validComment の hasOnly）
        batch.update(ref, ref.parent.id === "episodes" ? { visibleToTags: next, updatedAt: Date.now() } : { visibleToTags: next });
      }
      await batch.commit();
    }
    return { comments: staleComments.length, episodes: staleEpisodes.length };
  }

  let counts: { comments: number; episodes: number };
  if (narrowing) {
    counts = await writeChildren();
    if (!(await writePost())) return fail("非表示の投稿は変更できません", 403);
  } else {
    if (!(await writePost())) return fail("非表示の投稿は変更できません", 403);
    counts = await writeChildren();
  }
  // 投稿を書き換える前に、古い範囲を写して付いたコメントを直す
  const late = await writeChildren();

  return NextResponse.json({
    ok: true,
    changed: true,
    comments: counts.comments + late.comments,
    episodes: counts.episodes + late.episodes,
  });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   ハンドラの中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
//   監査ログに残るのは本文のキー名と対象の投稿 ID だけ（タグの中身は残らない）。
export const PUT = withGuard(
  {
    name: "posts.visibility",
    auth: "user",
    rateLimit: { key: "uid", limit: 20, windowSec: 60 },
    audit: { action: "post.visibility.update", target: (_b: unknown, _u: string | null, req: Request) => postIdOf(req) },
  },
  _PUT,
);
