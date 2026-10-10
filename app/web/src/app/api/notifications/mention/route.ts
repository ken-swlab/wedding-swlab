import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { publicName } from "@/lib/names";
import { POST_ID_RE } from "@/config/guestbook";
import { MAX_MENTIONS, mentionNotificationId } from "@/config/mentions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Firestore の「すでにある」（gRPC の ALREADY_EXISTS） */
const ALREADY_EXISTS = 6;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function _POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[notifications/mention] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * @メンションの通知を作る（Issue #92）。投稿・コメントを保存したあとにクライアントが呼ぶ。
 *
 * ★相手は、保存済みの投稿・コメントの mentionUids から読む（リクエストでは受け取らない）★
 *   リクエストで受け取ると、本文に無い相手へいくらでも通知を送れる。
 * ★通知する前に、次をすべて確かめる★
 *   - 呼び出した人が、その投稿（コメントのときはそのコメント）の作者であること
 *   - 投稿が表示中であること（非表示の投稿からは通知しない）
 *   - 相手が実在し、本登録・承認済みで、利用停止でないこと
 *   - 相手にその投稿が見えること（見えない人に、投稿の存在を知らせない）。Rules の canSee と同じく、
 *     所属タグが公開範囲（visibleToTags）と重なるか、管理者（新郎新婦。Custom Claims の admin）であるか、
 *     その投稿の作者であること（新郎新婦あての投稿に付いた返事。作者は couple タグを持たないが、自分の投稿は読める）
 *   - 相手が自分自身でないこと
 * ★通知の ID は mention_{コメントまたは投稿の ID}、書き込みは create()★
 *   同じ操作で2回呼ばれても1件のまま。既読にした通知が未読に戻ることもない。
 * ★通知に本文を入れない★ 投稿が非表示・削除になったあとに、通知の側へ本文が残らないようにする。
 *   入れるのは種類・送った人の uid とニックネーム・投稿（とコメント）の ID・作成日時・read だけ。
 * ★相手ごとの結果を返さない★ 誰に届いたかが分かると、相手の所属（その投稿が見えるか）を探れる。
 */
async function handle(req: Request) {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  let uid: string;
  try {
    uid = (await auth.verifyIdToken(idToken, true)).uid;
  } catch {
    return fail("ログインし直してください", 401);
  }

  let body: { postId?: unknown; commentId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("リクエストが不正です", 400);
  }

  // ★ID は形を確かめてから doc() に渡す★（"/" などが混ざると別のパスを指す）
  const postId = typeof body.postId === "string" ? body.postId : "";
  if (!POST_ID_RE.test(postId)) return fail("リクエストが不正です", 400);
  let commentId: string | null = null;
  if (body.commentId !== undefined) {
    if (typeof body.commentId !== "string" || !POST_ID_RE.test(body.commentId)) {
      return fail("リクエストが不正です", 400);
    }
    commentId = body.commentId;
  }

  const postRef = db.collection("posts").doc(postId);
  const [postSnap, commentSnap, senderSnap, senderPrivateSnap] = await Promise.all([
    postRef.get(),
    commentId ? postRef.collection("comments").doc(commentId).get() : null,
    db.collection("guests").doc(uid).get(),
    db.collection("guestPrivate").doc(uid).get(),
  ]);

  // 見つからない・作者でない・非表示は区別せずに断る（他人の投稿の有無を探らせない）
  const source = commentId ? commentSnap : postSnap;
  if (
    !postSnap.exists ||
    !source?.exists ||
    source.get("authorUid") !== uid ||
    postSnap.get("status") !== "visible" ||
    (commentId && commentSnap?.get("hidden") === true)
  ) {
    return fail("通知できない投稿です", 403);
  }
  if (!senderSnap.exists || senderSnap.get("isApproved") !== true) {
    return fail("承認されたゲストのみご利用いただけます", 403);
  }
  if (senderPrivateSnap.get("isActive") === false) {
    return fail("このアカウントはご利用いただけません", 403);
  }

  const rawTargets: unknown = source.get("mentionUids");
  const targets = [
    ...new Set(
      (Array.isArray(rawTargets) ? rawTargets : []).filter(
        (t): t is string => typeof t === "string" && t.length > 0 && t.length <= 128 && !t.includes("/") && t !== uid,
      ),
    ),
  ].slice(0, MAX_MENTIONS);
  if (targets.length === 0) return NextResponse.json({ ok: true });

  const rawVisible: unknown = postSnap.get("visibleToTags");
  const visibleToTags = new Set(Array.isArray(rawVisible) ? (rawVisible as unknown[]) : []);

  // 送った人のニックネームは、通知を書く時点の guests の値（本名は guests に無い）
  const fromName = publicName({ nickname: senderSnap.get("nickname") });
  const notificationId = mentionNotificationId(commentId ?? postId);
  const postAuthorUid: unknown = postSnap.get("authorUid");

  const targetSnaps = await Promise.all(
    targets.flatMap((t) => [db.collection("guests").doc(t).get(), db.collection("guestPrivate").doc(t).get()]),
  );

  await Promise.all(
    targets.map(async (target, i) => {
      const guest = targetSnaps[i * 2];
      const guestPrivate = targetSnaps[i * 2 + 1];
      if (
        !guest.exists ||
        guest.get("isRegistered") !== true ||
        guest.get("isApproved") !== true ||
        guest.get("isArchived") === true ||
        guest.get("mergedInto") ||
        guestPrivate.get("isActive") === false
      ) {
        return;
      }
      const tags: unknown = guest.get("tags");
      if (target !== postAuthorUid && (!Array.isArray(tags) || !tags.some((t) => visibleToTags.has(t)))) {
        // ★タグが重ならない相手は、管理者のときだけ通す★ guests のタグ（couple）ではなく Custom Claims で確かめる。
        //   Rules が全投稿を読ませるのは admin クレームを持つ人だけなので、それと同じ条件にする。
        const claims = (await auth.getUser(target).catch(() => null))?.customClaims;
        if (claims?.admin !== true) return;
      }

      try {
        await db
          .collection("notifications")
          .doc(target)
          .collection("items")
          .doc(notificationId)
          .create({
            type: "mention",
            fromUid: uid,
            fromName,
            postId,
            ...(commentId ? { commentId } : {}),
            createdAt: FieldValue.serverTimestamp(),
            read: false,
          });
      } catch (e) {
        // 2回めの呼び出し。すでに通知があるので何もしない
        if ((e as { code?: unknown }).code === ALREADY_EXISTS) return;
        throw e;
      }
    }),
  );

  return NextResponse.json({ ok: true });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
//   監査ログに残るのは本文のキー名と対象の投稿 ID だけ（ニックネームや本文は残らない）。
export const POST = withGuard(
  {
    name: "notifications.mention",
    auth: "user",
    rateLimit: { key: "uid", limit: 30, windowSec: 60 },
    audit: { action: "mention.notify", target: (b) => b.postId },
  },
  _POST,
);
