import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { answerChangePatch, parseAnswers } from "@/lib/answers-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function _POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[guest/questionnaire] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * 招待状で答えた内容（本名・ふりがな・出欠・アレルギー）を、案内モード（/guide/questionnaire）から直す。
 *
 * ★登録済みのゲストだけ★ 初回の回答は /api/guest/register（パスコードの確認つき）で行う。
 * ★出欠・アレルギーが変わったら guestAdmin に印を付ける★（answerChangePatch の★参照）
 *   管理画面のゲスト一覧で「変更あり」と出し、管理者が確認済みにするまで残す。
 * ★本名とアレルギーは guestPrivate だけに書く★ guests はゲスト全員が読める。
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

  let body: { realName?: unknown; kana?: unknown; attendance?: unknown; allergy?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("リクエストが不正です", 400);
  }
  const parsed = parseAnswers(body);
  if ("error" in parsed) return fail(parsed.error, 400);
  const { answers } = parsed;

  const publicRef = db.collection("guests").doc(uid);
  const privateRef = db.collection("guestPrivate").doc(uid);
  const adminRef = db.collection("guestAdmin").doc(uid);
  const [publicSnap, privateSnap, adminSnap] = await Promise.all([
    publicRef.get(),
    privateRef.get(),
    adminRef.get(),
  ]);

  if (privateSnap.get("isActive") === false) {
    return fail("このアカウントはご利用いただけません", 403);
  }
  if (publicSnap.get("isRegistered") !== true) {
    return fail("先に招待状のページからご回答ください", 403);
  }

  const batch = db.batch();
  batch.set(
    privateRef,
    {
      realName: answers.realName,
      kana: answers.kana,
      attendance: answers.attendance,
      allergy: answers.allergy,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  const change = answerChangePatch(privateSnap, adminSnap, answers);
  if (change) batch.set(adminRef, { uid, ...change }, { merge: true });
  await batch.commit();

  return NextResponse.json({ ok: true, changed: change !== null });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
//   監査ログに残るのは本文のキー名だけ（本名・アレルギーの中身は残らない）。
export const POST = withGuard(
  {
    name: "guest.questionnaire.update",
    auth: "user",
    rateLimit: { key: "uid", limit: 20, windowSec: 60 },
    audit: { action: "answers.update", target: (_b, uid) => uid },
  },
  _POST,
);
