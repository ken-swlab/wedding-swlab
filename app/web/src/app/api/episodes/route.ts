import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import { TAG_DEFS } from "@/config/tags";
import { EPISODE_THEMES, MAX_EPISODE_CONTENT } from "@/config/episodes";
import { withGuard } from "@/lib/route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KNOWN_TAGS = new Set(TAG_DEFS.map((t) => t.id));
const KNOWN_THEMES = new Set<string>(EPISODE_THEMES.map((t) => t.id));

/** 1人あたりの投稿上限。荒らし対策の素朴な歯止め */
const MAX_PER_GUEST = 50;
const MAX_PHOTOS = 4;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/**
 * 自分の配信元の URL だけを受け付ける。
 *
 * ★R2 移行時に取り残されていた★
 *   Composer は R2 の URL を送っているのに、ここが Firebase Storage の
 *   URL しか通さなかったため photoUrls は常に空になっていた。
 *   しかも filter で黙って捨てるので、エラーにもならなかった。
 */
function isOurStorageUrl(url: string): boolean {
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (bucket && url.startsWith(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/`)) {
    return true;
  }
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    host = u.hostname;
  } catch {
    return false;
  }
  for (const v of [
    process.env.NEXT_PUBLIC_MEDIA_BASE,
    process.env.R2_PUBLIC_BASE,
    process.env.R2_PUBLIC_BASE_LEGACY,
  ]) {
    if (!v) continue;
    try {
      if (new URL(v).hostname === host) return true;
    } catch {
      /* 無視 */
    }
  }
  return false;
}

async function _POST(req: Request) {
  // 想定外の例外でも必ず JSON を返す
  try {
    return await handle(req);
  } catch (e) {
    console.error("[episodes POST]", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}

async function handle(req: Request) {
  const { auth, db } = admin();

  // ---- 認証 ------------------------------------------------
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  let uid: string;
  let myTags: string[];
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    uid = decoded.uid;
    myTags = Array.isArray(decoded.tags) ? (decoded.tags as string[]) : [];
  } catch {
    return fail("ログインし直してください", 401);
  }

  // 承認済み（タグを持っている）ゲストのみ
  if (myTags.length === 0) {
    return fail("新郎新婦の承認後にご利用いただけます", 403);
  }

  // ---- 入力の検証 ------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("リクエストが不正です", 400);
  }

  const theme = typeof body.theme === "string" ? body.theme.trim() : "";
  if (!KNOWN_THEMES.has(theme)) return fail("お題が不正です", 400);

  const originalText = typeof body.originalText === "string" ? body.originalText.trim() : "";
  if (!originalText) return fail("エピソードの本文を入力してください", 400);
  if (originalText.length > MAX_EPISODE_CONTENT) {
    return fail(`本文は${MAX_EPISODE_CONTENT}文字までです`, 400);
  }

  const photoUrls = Array.isArray(body.photoUrls)
    ? (body.photoUrls as unknown[])
        .filter((u): u is string => typeof u === "string" && isOurStorageUrl(u))
        .slice(0, MAX_PHOTOS)
    : [];

  // ★公開範囲は「自分が持っているタグ」に限る★
  //   posts の tagsInMyScope() と同じ不変条件。
  //   ここを緩めると、所属していないグループ向けに
  //   エピソードを差し込めてしまう。
  const rawVisible = Array.isArray(body.visibleToTags)
    ? (body.visibleToTags as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const visibleToTags = [...new Set(rawVisible)].sort();

  if (visibleToTags.length === 0) return fail("公開範囲を1つ以上選んでください", 400);
  if (visibleToTags.length > 20) return fail("公開範囲が多すぎます", 400);
  if (visibleToTags.some((t) => !KNOWN_TAGS.has(t))) {
    return fail("公開範囲のタグが不正です", 400);
  }
  if (visibleToTags.some((t) => !myTags.includes(t))) {
    return fail("ご自身が属していない公開範囲は選べません", 403);
  }

  // ---- 投稿数の歯止め --------------------------------------
  const mine = await db
    .collection("episodes")
    .where("authorUid", "==", uid)
    .limit(MAX_PER_GUEST + 1)
    .get();
  if (mine.size > MAX_PER_GUEST) {
    return fail("エピソードの投稿数が上限に達しました", 429);
  }

  // ---- 保存 ------------------------------------------------
  const guest = await db.collection("guests").doc(uid).get();
  const now = Date.now();

  const ref = await db.collection("episodes").add({
    // ★必ず pending★ 承認は管理者の /admin/episodes から
    status: "pending",

    authorUid: uid,
    // ★公開名だけ★ authorName は他のゲストに見える。本名を入れない
    authorName: guest.get("nickname") || "ゲスト",
    theme,
    originalText,
    photoUrls,
    createdAt: now,

    // 管理者が整える欄。初期値は生テキストを入れておく
    title: "",
    period: "",
    content: originalText,

    // 「誰についての話か」は管理者が承認時に設定する
    targetTags: [],
    targetUids: [],

    // 「誰に見せてよいか」は投稿時の公開範囲をそのまま引き継ぐ
    visibleToTags,

    updatedAt: now,
  });

  return NextResponse.json({ ok: true, id: ref.id });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const POST = withGuard({ name: "episodes.create", auth: "user", rateLimit: { key: "uid", limit: 10, windowSec: 60 } }, _POST);
