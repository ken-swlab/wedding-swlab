import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { isPasscodeCleared } from "@/lib/passcode-server";
import { REACTION_MAX_MS, REACTION_MIN_MS } from "@/config/opening";
import type { ReactionStatus } from "@/types/invitation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function ok(res: ReactionStatus) {
  return NextResponse.json({ ok: true, ...res }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * オープニング演出のリアクションタイム（Issue #131）。
 *   GET  … 自分の記録だけを返す（無ければ null）
 *   POST … 記録する。本文は { reactionMs }
 *
 * ★記録は最初の1回だけ（一発勝負）★
 *   reactionTimes/{uid} をトランザクションの中で「無ければ作る」。すでにあれば上書きせず、保存済みの値を返す。
 * ★承認前のゲストも記録できる★ オープニングは合言葉を通った直後に流れる。
 *   ただし、パスコードを通った人（登録済み・管理者を含む）だけ。LINE でログインしただけの人には書かせない。
 * ★値はクライアントの計測★ 偽装は完全には防げない。内輪のランキングなので、範囲の確認と1回だけの記録で割り切る。
 * ★reactionTimes はクライアントから読み書きできない★（Rules の既定の拒否。読むのはこの API とランキングの API だけ）。
 *   入れるのは uid・タイム・記録した時刻だけ。名前は入れない。
 */
async function identify(req: Request): Promise<{ uid: string } | Response> {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  let uid: string;
  let isAdmin: boolean;
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    uid = decoded.uid;
    isAdmin = decoded.admin === true;
  } catch {
    return fail("ログインし直してください", 401);
  }

  const [publicSnap, privateSnap, adminSnap] = await Promise.all([
    db.collection("guests").doc(uid).get(),
    db.collection("guestPrivate").doc(uid).get(),
    db.collection("guestAdmin").doc(uid).get(),
  ]);
  if (privateSnap.get("isActive") === false) return fail("このアカウントはご利用いただけません", 403);
  if (!isAdmin && !isPasscodeCleared(publicSnap, adminSnap)) return fail("パスコードの入力が必要です", 403);
  return { uid };
}

/** 保存済みの値として信用できる形か（壊れた値を画面に流さない） */
function savedMs(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= REACTION_MIN_MS && v <= REACTION_MAX_MS ? v : null;
}

async function _GET(req: Request) {
  try {
    const who = await identify(req);
    if (who instanceof Response) return who;
    const snap = await admin().db.collection("reactionTimes").doc(who.uid).get();
    return ok({ reactionMs: snap.exists ? savedMs(snap.get("reactionMs")) : null });
  } catch (e) {
    console.error("[guest/reaction] 未捕捉の例外（GET）", e);
    return fail(safeMessage(e), 500);
  }
}

async function _POST(req: Request) {
  try {
    const who = await identify(req);
    if (who instanceof Response) return who;

    let body: { reactionMs?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return fail("リクエストが不正です", 400);
    }
    const reactionMs = body.reactionMs;
    if (typeof reactionMs !== "number" || !Number.isInteger(reactionMs) || reactionMs < REACTION_MIN_MS || reactionMs > REACTION_MAX_MS) {
      return fail("記録できない値です", 400);
    }

    const { db } = admin();
    const ref = db.collection("reactionTimes").doc(who.uid);
    const result = await db.runTransaction<ReactionStatus>(async (tx) => {
      const snap = await tx.get(ref);
      // ★すでに記録があれば上書きしない★ 保存済みの値をそのまま返す
      if (snap.exists) return { reactionMs: savedMs(snap.get("reactionMs")), recorded: false };
      tx.create(ref, { uid: who.uid, reactionMs, recordedAt: FieldValue.serverTimestamp() });
      return { reactionMs, recorded: true };
    });
    return ok(result);
  } catch (e) {
    console.error("[guest/reaction] 未捕捉の例外（POST）", e);
    return fail(safeMessage(e), 500);
  }
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   identify の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const GET = withGuard({ name: "guest.reaction.get", auth: "user", rateLimit: { key: "uid", limit: 30, windowSec: 60 } }, _GET);
export const POST = withGuard(
  { name: "guest.reaction", auth: "user", rateLimit: { key: "uid", limit: 10, windowSec: 60 }, audit: { action: "guest.reaction", target: (_b, uid) => uid } },
  _POST,
);
