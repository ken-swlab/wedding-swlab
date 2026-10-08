import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { isPasscodeCleared } from "@/lib/passcode-server";
import { answerChangePatch, answersPrivatePatch, parseAnswers, type AnswersBody } from "@/lib/answers-server";
import { DEFAULT_NICKNAME_PREFIX } from "@/config/answers";
import { PROFILE_NICKNAME_MAX } from "@/config/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ニックネームを空欄で送られたときの既定名（例: ゲスト0427）。uid から決めるので送り直しても変わらない。
 * ★LINE の表示名を使わない★ guests は承認済みゲスト全員が読める。LINE 名は本名のことが多い（CLAUDE.md ルール5）。
 */
function defaultNickname(uid: string): string {
  let h = 0;
  for (const c of uid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${DEFAULT_NICKNAME_PREFIX}${String(h % 10000).padStart(4, "0")}`;
}

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function _POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[guest/register] 未捕捉の例外", e);
    return fail("サーバー内部エラー", 500);
  }
}

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

  let body: AnswersBody & { nickname?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("リクエストが不正です", 400);
  }

  const parsed = parseAnswers(body);
  if ("error" in parsed) return fail(parsed.error, 400);
  const { answers } = parsed;
  const nicknameInput = typeof body.nickname === "string" ? body.nickname.trim() : "";
  if (nicknameInput.length > PROFILE_NICKNAME_MAX) {
    return fail(`ニックネームは${PROFILE_NICKNAME_MAX}文字までです`, 400);
  }

  const publicRef = db.collection("guests").doc(uid);
  const privateRef = db.collection("guestPrivate").doc(uid);
  const adminRef = db.collection("guestAdmin").doc(uid);

  const [publicSnap, privateSnap, adminSnap] = await Promise.all([
    publicRef.get(), privateRef.get(), adminRef.get(),
  ]);

  /**
   * ★停止されたユーザーは再登録で復活できない★
   *   tags を空にする締め出しだけだと、本人が登録フォームを
   *   送り直したときに承認待ちキューへ戻ってきてしまう。
   */
  if (privateSnap.get("isActive") === false) {
    return fail("このアカウントはご利用いただけません", 403);
  }

  /**
   * ★パスコードは /api/guest/passcode で先に通しておく★
   *   招待状のページで4桁を入れた時点で判定し、通ったら guestAdmin.passcodeClearedAt が付く。
   *   ここではその記録（または登録済み）だけを確かめ、パスコードは受け取らない。
   *   入力内容の修正（2回目以降）でも聞かれない。
   *   isRegistered を true にできるのはこのルートだけなので、
   *   「一度はパスコードを通った」ことの証明になっている。
   */
  if (!isPasscodeCleared(publicSnap, adminSnap)) {
    return fail("先に招待状のページでパスコードをご入力ください", 403);
  }

  /**
   * ★guests に氏名を書かない★
   *   guests はサインイン済みのゲストなら list できる領域。
   *   本名とふりがなは guestPrivate（本人と管理者だけ）に置く。
   */
  // 空欄なら、すでに付いているニックネーム（送り直し）か既定名
  const existingNickname = publicSnap.get("nickname");
  const nickname = nicknameInput
    || (typeof existingNickname === "string" && existingNickname.trim() ? existingNickname : defaultNickname(uid));

  const publicPatch: Record<string, unknown> = {
    nickname, isRegistered: true, updatedAt: FieldValue.serverTimestamp(),
  };
  if (publicSnap.get("isApproved") === undefined) publicPatch.isApproved = false;

  const privatePatch: Record<string, unknown> = {
    uid, ...answersPrivatePatch(answers),
    submittedAt: FieldValue.serverTimestamp(),
  };
  if (privateSnap.get("paymentStatus") === undefined) privatePatch.paymentStatus = "none";
  if (privateSnap.get("isActive") === undefined) privatePatch.isActive = true;

  const batch = db.batch();
  batch.set(publicRef, publicPatch, { merge: true });
  batch.set(privateRef, privatePatch, { merge: true });

  /**
   * ★登録済みの人が送り直したときも、出欠・アレルギーの変更に印を付ける★
   *   /onboarding の「入力内容を変更する」からもここへ来る。/guide/questionnaire と同じ印を付けないと、
   *   こちらから直すだけで管理画面の「変更あり」を通り抜けてしまう（answerChangePatch の★参照）。
   */
  if (publicSnap.get("isRegistered") === true) {
    const change = answerChangePatch(privateSnap, adminSnap, answers);
    if (change) batch.set(adminRef, { uid, ...change }, { merge: true });
  }
  await batch.commit();

  return NextResponse.json({ ok: true, nickname });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const POST = withGuard({ name: "guest.register", auth: "user", rateLimit: { key: "uid", limit: 20, windowSec: 60 }, audit: { action: "guest.register", target: (_b, uid) => uid } }, _POST);
