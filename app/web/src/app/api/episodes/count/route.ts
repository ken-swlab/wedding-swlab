import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { EPISODE_COUNT_CACHE_MS, EPISODE_COUNT_ENABLED, EPISODE_COUNT_MIN } from "@/config/episode-prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/** 数えた件数（このサーバーの中で EPISODE_COUNT_CACHE_MS だけ覚える） */
let cached: { at: number; count: number } | null = null;

async function _GET(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[episodes/count] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * 「いま ◯件の思い出が集まっています」の件数（Issue #284）。
 *
 * ★返すのは件数だけ★ お題付きで投稿されたエピソード（episodes。全件がお題付き）を、全タグの合計で数える。
 *   見る人の公開範囲には関係なく、全体の件数（中身・公開範囲・投稿者は返さない）。
 * ★EPISODE_COUNT_MIN 未満の間は件数を返さない（null）★ 画面は件数の行を出さない。EPISODE_COUNT_ENABLED が false でも null。
 * ★数えるのは EPISODE_COUNT_CACHE_MS に1回まで★（Firestore の集計を投稿画面を開くたびに呼ばない）
 */
async function handle(req: Request) {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);
  let tags: string[];
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    tags = Array.isArray(decoded.tags) ? (decoded.tags as string[]) : [];
  } catch {
    return fail("ログインし直してください", 401);
  }
  // 承認済み（タグを持っている）ゲストだけ
  if (tags.length === 0) return fail("新郎新婦の承認後にご利用いただけます", 403);
  if (!EPISODE_COUNT_ENABLED) return NextResponse.json({ ok: true, count: null });

  const now = Date.now();
  if (!cached || now - cached.at > EPISODE_COUNT_CACHE_MS) {
    const snap = await db.collection("episodes").count().get();
    cached = { at: now, count: snap.data().count };
  }
  const count = cached.count >= EPISODE_COUNT_MIN ? cached.count : null;
  return NextResponse.json({ ok: true, count }, { headers: { "Cache-Control": "private, max-age=60" } });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
export const GET = withGuard({ name: "episodes.count", auth: "user", rateLimit: { key: "uid", limit: 30, windowSec: 60 } }, _GET);
