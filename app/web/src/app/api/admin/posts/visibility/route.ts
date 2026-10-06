import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { POST_ID_RE } from "@/config/guestbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 1 回のバッチで書く件数（Firestore の上限は 500） */
const BATCH_SIZE = 400;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function _POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[admin/posts/visibility] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * 投稿を非表示にする・戻す（Issue #68）。
 *
 * ★投稿と一緒に、その投稿のコメントも隠す★
 *   コメントの横断購読（/screen の collectionGroup("comments")）の Rules は、コメント自身の
 *   visibleToTags だけで判定する（親の投稿を get するとコメント 1 件ごとに読み取りが増える）。
 *   投稿だけを status: "hidden" にしても、コメントは投稿時の範囲のまま読めてしまう。
 * ★印は visibleToTags を空にし、hidden: true を付ける★
 *   - 空の visibleToTags は誰のタグとも重ならないので、既存のクエリ（array-contains-any）と Rules の
 *     canSee() のまま外れる。既存のコメントの移行（hidden: false の書き足し）や新しいインデックスが要らない。
 *   - hidden は画面の表示（「非表示になりました」）と、本人の一覧（マイページ）の検索に使う。
 *   - 戻すときは、親の投稿の visibleToTags を写し直す（コメントの範囲は常に親と同じ。validComment の★）。
 * 書くのは Admin SDK だけ。コメントの作成時の validComment() の hasOnly には hidden を入れていない。
 */
async function handle(req: Request) {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    if (decoded.admin !== true) return fail("管理者権限が必要です", 403);
  } catch {
    return fail("ログインし直してください", 401);
  }

  let body: { postId?: unknown; hidden?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("リクエストが不正です", 400);
  }
  const postId = typeof body.postId === "string" ? body.postId : "";
  if (!POST_ID_RE.test(postId)) return fail("投稿の ID が不正です", 400);
  if (typeof body.hidden !== "boolean") return fail("hidden は真偽値で指定してください", 400);
  const hidden = body.hidden;

  const postRef = db.collection("posts").doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) return fail("投稿が見つかりません", 404);
  const visibleToTags = (postSnap.get("visibleToTags") as string[] | undefined) ?? [];

  // ★先にコメントを隠し、最後に投稿を切り替える★
  //   途中で失敗しても「投稿は見えているのにコメントだけ消えた」側に倒れる（逆だと隠したつもりの投稿のコメントが残る）。
  //   戻すときは逆に、先に投稿を戻してからコメントを戻す。
  if (!hidden) {
    await postRef.update({ status: "visible", hiddenAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  }

  const comments = await postRef.collection("comments").get();
  const commentPatch = hidden
    ? { visibleToTags: [], hidden: true, hiddenAt: FieldValue.serverTimestamp() }
    : { visibleToTags, hidden: FieldValue.delete(), hiddenAt: FieldValue.delete() };
  for (let i = 0; i < comments.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const c of comments.docs.slice(i, i + BATCH_SIZE)) batch.update(c.ref, commentPatch);
    await batch.commit();
  }

  let late = 0;
  if (hidden) {
    await postRef.update({ status: "hidden", hiddenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    // 上で隠してから投稿を切り替えるまでの間に付いたコメントも隠す（非表示の投稿にはもうコメントできない。Rules）
    const again = await postRef.collection("comments").get();
    const missed = again.docs.filter((c) => c.get("hidden") !== true);
    late = missed.length;
    for (let i = 0; i < missed.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const c of missed.slice(i, i + BATCH_SIZE)) batch.update(c.ref, commentPatch);
      await batch.commit();
    }
  }

  return NextResponse.json({ ok: true, postId, hidden, comments: comments.size + late });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const POST = withGuard(
  {
    name: "admin.posts.visibility",
    auth: "admin",
    rateLimit: { key: "uid", limit: 60, windowSec: 60 },
    audit: { action: "post.visibility", target: (b) => b.postId },
  },
  _POST,
);
