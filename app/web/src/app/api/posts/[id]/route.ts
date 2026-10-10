import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { PublicError, safeMessage } from "@/lib/public-error";
import { rebuildDetectedUserIds } from "@/lib/faces-server";
import { ownsKey, publicUrlOf } from "@/lib/r2-server";
import { extractTags, MAX_POST_LENGTH } from "@/lib/text";
import { POST_ID_RE } from "@/config/guestbook";
import { MAX_MEDIA_PER_POST, NEW_MEDIA_KEY_RE, POSTS_API_PATH_RE } from "@/config/post-edit";
import type { MediaItem } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/** URL のパス（/api/posts/{id}）から投稿の ID を取り出す。★形を確かめてから doc() に渡す★ */
function postIdOf(req: Request): string | null {
  const id = POSTS_API_PATH_RE.exec(new URL(req.url).pathname)?.[1] ?? "";
  return POST_ID_RE.test(id) ? id : null;
}

async function authenticate(req: Request): Promise<{ uid: string } | Response> {
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);
  try {
    return { uid: (await admin().auth.verifyIdToken(idToken, true)).uid };
  } catch {
    return fail("ログインし直してください", 401);
  }
}

const isSize = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 20000;

/**
 * 編集で足した写真・動画1件を、保存する形に組み立てる。だめなら PublicError。
 *
 * ★クライアントの値を信用しない★
 *   - キーは本人の軽量版の名前空間（u/{uid}/t/）だけ。他人のキーや外部の URL は入れられない
 *   - url はサーバーがキーから組み立てる（クライアントの url は読まない）
 *   - 原本のキーも本人の名前空間（u/{uid}/o/）だけ。状態は必ず pending から始める
 *     （published などを名乗らせると、公開されていない原本を「公開済み」として扱わせられる）
 */
function newMediaItem(uid: string, raw: Record<string, unknown>): MediaItem {
  const key = typeof raw.storagePath === "string" ? raw.storagePath : "";
  const type = raw.type === "video" ? "video" : raw.type === "image" ? "image" : null;
  if (!type || !ownsKey(uid, key, "thumb") || !NEW_MEDIA_KEY_RE[type].test(key)) {
    throw new PublicError("写真・動画の指定が不正です");
  }

  const item: MediaItem = { type, url: publicUrlOf(key), storagePath: key };
  if (isSize(raw.width) && isSize(raw.height)) {
    item.width = raw.width;
    item.height = raw.height;
  }
  if (typeof raw.alt === "string" && raw.alt) item.alt = raw.alt.slice(0, 200);

  if (type === "image" && raw.originalPath !== undefined) {
    const original = typeof raw.originalPath === "string" ? raw.originalPath : "";
    if (!ownsKey(uid, original, "original")) throw new PublicError("写真・動画の指定が不正です");
    item.originalPath = original;
    item.originalStatus = "pending";
  }
  return item;
}

async function _PATCH(req: Request) {
  try {
    return await update(req);
  } catch (e) {
    console.error("[posts/update] 未捕捉の例外", e);
    return fail(safeMessage(e), e instanceof PublicError ? 400 : 500);
  }
}

/**
 * 自分の投稿の本文と写真を編集する（Issue #94）。
 *
 * ★本人の投稿だけ★ 管理者でも、この API では他人の投稿を変えない（管理者の非表示は /api/admin/posts/visibility）。
 * ★変えるのは text・media と、そこから決まる hashtags・mentions・editedAt だけ★
 *   visibleToTags・status・カウンタ・createdAt・mentionUids は受け取らず、変えない。
 *   公開範囲を変えると、投稿時の範囲を写したコメントの visibleToTags と食い違う（Rules の★参照）。
 * ★残す写真は、いま保存されている要素をそのまま使う★（照合は storagePath）
 *   高画質版の状態（originalStatus など）はあとから Worker が書くので、クライアントの値で上書きしない。
 *   読んで書くまでをトランザクションにする（原本の紐付け・webhook と同時に走ると書き負ける）。
 * ★editedAt は、本文か写真が実際に変わったときだけ付ける★ 何も変えない保存では何も書かない。
 *   updatedAt はいいね・コメントでも動くので、「編集済」の判定には使えない。
 * ★R2 のオブジェクトは消さない★ 外した写真の軽量版・原本・Worker のマーカーは残す（CLAUDE.md ルール 18）。
 */
async function update(req: Request) {
  const { db } = admin();
  const who = await authenticate(req);
  if (who instanceof Response) return who;
  const { uid } = who;

  const postId = postIdOf(req);
  if (!postId) return fail("リクエストが不正です", 400);

  let body: { text?: unknown; media?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("リクエストが不正です", 400);
  }

  if (typeof body.text !== "string") return fail("リクエストが不正です", 400);
  const text = body.text.trim();
  if (text.length > MAX_POST_LENGTH) return fail(`本文は${MAX_POST_LENGTH}文字までです`, 400);

  if (!Array.isArray(body.media)) return fail("リクエストが不正です", 400);
  if (body.media.length > MAX_MEDIA_PER_POST) return fail(`メディアは${MAX_MEDIA_PER_POST}件までです`, 400);
  const requested: Record<string, unknown>[] = [];
  for (const m of body.media as unknown[]) {
    if (!m || typeof m !== "object" || Array.isArray(m)) return fail("写真・動画の指定が不正です", 400);
    requested.push(m as Record<string, unknown>);
  }
  const paths = requested.map((m) => (typeof m.storagePath === "string" ? m.storagePath : ""));
  if (paths.some((p) => !p) || new Set(paths).size !== paths.length) {
    return fail("写真・動画の指定が不正です", 400);
  }
  if (!text && requested.length === 0) return fail("本文か写真のどちらかは必要です", 400);

  const postRef = db.collection("posts").doc(postId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(postRef);
    // 見つからない・他人の投稿は区別しない（他人の投稿の有無を探らせない）
    if (!snap.exists || snap.get("authorUid") !== uid) return { kind: "error" as const, res: fail("編集できない投稿です", 403) };
    if (snap.get("status") !== "visible") return { kind: "error" as const, res: fail("非表示の投稿は編集できません", 403) };

    const oldText = String(snap.get("text") ?? "");
    const oldMedia = (Array.isArray(snap.get("media")) ? snap.get("media") : []) as MediaItem[];
    const kept = new Map(oldMedia.map((m) => [m.storagePath, m]));
    const media = requested.map((m, i) => kept.get(paths[i]) ?? newMediaItem(uid, m));

    const oldPaths = oldMedia.map((m) => m.storagePath);
    const textChanged = text !== oldText;
    const mediaChanged = oldPaths.length !== paths.length || oldPaths.some((p, i) => p !== paths[i]);
    if (!textChanged && !mediaChanged) return { kind: "same" as const };

    // 候補から選んで入れたメンションの名前（打ったままの形）は、本文に残っている分だけ引き継ぐ。
    // 残りの @文字 と #タグ は新しい本文から作り直す（lib/text.ts の extractTags）
    const oldMentions: unknown = snap.get("mentions");
    const keptNames = (Array.isArray(oldMentions) ? oldMentions : []).filter(
      (m): m is string => typeof m === "string" && !!m && (text.includes(`@${m}`) || text.includes(`＠${m}`)),
    );
    const { hashtags, mentions } = extractTags(text, keptNames);

    const addedImage = media.some((m) => m.type === "image" && !kept.has(m.storagePath));
    tx.update(postRef, {
      text,
      media,
      hashtags,
      mentions,
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      // 足した写真があれば顔の検出をやり直す（クライアントが /api/faces/detect を呼ぶ）
      ...(addedImage ? { faceDetectionStatus: "pending" } : {}),
    });
    return { kind: "changed" as const, textChanged, mediaChanged, addedImage, oldPaths };
  });

  if (result.kind === "error") return result.res;
  if (result.kind === "same") return NextResponse.json({ ok: true, changed: false });

  // 顔の記録を新しい写真の並びに合わせる。失敗しても編集は成立している（ログに残し、応答は成功）
  if (result.mediaChanged || result.textChanged) {
    try {
      await syncFaces(postId, result.oldPaths, paths, text, result.mediaChanged);
    } catch (e) {
      console.error("[posts/update] 顔の記録の更新に失敗", postId, e);
    }
  }

  return NextResponse.json({ ok: true, changed: true, detectFaces: result.addedImage });
}

/**
 * 編集のあと、faces を新しい media の並びに合わせる。
 *
 * ★外した写真の顔は消し、detectedUserIds を作り直す★
 *   残すと、もう投稿に無い写真に写っていた人が「この投稿に写っている人」に残り続ける
 *   （ギャラリーの人物の絞り込み・エンドロールの選定がずれる）。
 * ★位置がずれた写真の顔は、ID と mediaIndex を付け替える★（ID は {postId}_{mediaIndex}_{n}）
 *   そのままだと、あとの再検出が別の写真の顔を上書きする。削除を先に、作成をあとに積む
 *   （付け替え先の ID が、同じバッチで消す ID と重なることがある）。
 */
async function syncFaces(postId: string, oldPaths: string[], newPaths: string[], text: string, mediaChanged: boolean) {
  const { db } = admin();
  const snap = await db.collection("faces").where("postId", "==", postId).get();
  if (snap.empty) return;

  const postText = text.slice(0, 120);
  const batch = db.batch();
  const moved: { id: string; data: FirebaseFirestore.DocumentData }[] = [];
  let remaining = 0;

  for (const d of snap.docs) {
    const index = d.get("mediaIndex") as number;
    const next = newPaths.indexOf(oldPaths[index] ?? "");
    if (next < 0) {
      batch.delete(d.ref);
      continue;
    }
    remaining += 1;
    if (next === index) {
      batch.update(d.ref, { postText });
      continue;
    }
    const n = d.id.slice(d.id.lastIndexOf("_") + 1);
    batch.delete(d.ref);
    moved.push({ id: `${postId}_${next}_${n}`, data: { ...d.data(), mediaIndex: next, postText } });
  }
  for (const m of moved) batch.set(db.collection("faces").doc(m.id), m.data);
  await batch.commit();

  if (!mediaChanged) return;
  await db.collection("posts").doc(postId).update({ faceCount: remaining });
  await rebuildDetectedUserIds(postId);
}

async function _DELETE(req: Request) {
  try {
    return await remove(req);
  } catch (e) {
    console.error("[posts/delete] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * 自分の投稿を削除する（Issue #94）。
 *
 * ★本人の投稿だけ★ 管理者でも、この API では他人の投稿を消さない。
 * ★本当に消す（論理削除にしない）★ 投稿・コメント・いいねを recursiveDelete でまとめて消す。
 *   「削除済み」の状態を足す方式だと、本人は自分の投稿を Rules 上いつでも読めるので、
 *   マイページ・検索・スクリーン・顔の判定のすべてに「削除済みを除く」条件が要り、漏れると出てしまう。
 *   クライアントから投稿だけを消すと、コメントといいねが孤児として残る。
 * ★顔の記録（faces）も消す★ 写真の切り抜き位置と本文の冒頭を持っている。
 * ★R2 のオブジェクトは消さない★ 軽量版・原本・Worker のマーカーは残す（CLAUDE.md ルール 18）。
 *   あとから Worker の webhook が来ても、投稿が見つからなければ 202 を返すだけ（/api/hooks/original-published）。
 */
async function remove(req: Request) {
  const { db } = admin();
  const who = await authenticate(req);
  if (who instanceof Response) return who;

  const postId = postIdOf(req);
  if (!postId) return fail("リクエストが不正です", 400);

  const postRef = db.collection("posts").doc(postId);
  const snap = await postRef.get();
  // 見つからない・他人の投稿は区別しない
  if (!snap.exists || snap.get("authorUid") !== who.uid) return fail("削除できない投稿です", 403);

  await db.recursiveDelete(postRef);

  const faces = await db.collection("faces").where("postId", "==", postId).get();
  if (!faces.empty) {
    const batch = db.batch();
    for (const d of faces.docs) batch.delete(d.ref);
    await batch.commit();
  }

  return NextResponse.json({ ok: true });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   ハンドラの中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
//   監査ログに残るのは本文のキー名と対象の投稿 ID だけ（本文の中身は残らない）。
const target = (_body: unknown, _uid: string | null, req: Request) => postIdOf(req);

export const PATCH = withGuard(
  {
    name: "posts.update",
    auth: "user",
    rateLimit: { key: "uid", limit: 20, windowSec: 60 },
    audit: { action: "post.update", target },
  },
  _PATCH,
);

export const DELETE = withGuard(
  {
    name: "posts.delete",
    auth: "user",
    rateLimit: { key: "uid", limit: 20, windowSec: 60 },
    audit: { action: "post.delete", target },
  },
  _DELETE,
);
