import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { TEXT_SCALES, type TextScale } from "@/config/text-scale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function _POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[guest/preferences] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * 本人の表示の設定（Issue #243）。文字の大きさ（textScale: "large" | "normal"）と、
 * 「写真は2回に分けて届けます」の説明を見た印（photoIntroSeen: true。Issue #272。一度見たら戻さないので true だけ受ける）。
 * どちらか1つ以上を送る。
 *
 * ★保存先は guestPrivate（本人と管理者だけが読める）★ ゲストどうしで見える guests には置かない。
 *   guestPrivate は本人も直接は書けない（Rules）ので、ここで値を確かめてから Admin SDK で書く。
 * ★未設定のときの既定は画面が決める★ 親族用から答えた人（invitationKind: "family"）は大きく、ほかは今の大きさ
 *   （src/config/text-scale.ts の effectiveTextScale）。
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

  let body: { textScale?: unknown; photoIntroSeen?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("リクエストが不正です", 400);
  }
  const update: { textScale?: TextScale; photoIntroSeen?: true } = {};
  if (body.textScale !== undefined) {
    if (typeof body.textScale !== "string" || !(TEXT_SCALES as readonly string[]).includes(body.textScale)) {
      return fail("文字の大きさの指定が不正です", 400);
    }
    update.textScale = body.textScale as TextScale;
  }
  if (body.photoIntroSeen !== undefined) {
    if (body.photoIntroSeen !== true) return fail("指定が不正です", 400);
    update.photoIntroSeen = true;
  }
  if (Object.keys(update).length === 0) return fail("変える設定がありません", 400);

  const privateRef = db.collection("guestPrivate").doc(uid);
  const [publicSnap, privateSnap] = await Promise.all([db.collection("guests").doc(uid).get(), privateRef.get()]);
  // 回答を送った人だけ（マイページ・ご案内に入れるのは登録済みの人）
  if (publicSnap.get("isRegistered") !== true) return fail("先に招待状のページからご回答ください", 403);
  if (privateSnap.get("isActive") === false) return fail("このアカウントはご利用いただけません", 403);

  await privateRef.set({ ...update, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return NextResponse.json({ ok: true, ...update });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const POST = withGuard(
  {
    name: "guest.preferences.update",
    auth: "user",
    rateLimit: { key: "uid", limit: 20, windowSec: 60 },
    audit: { action: "preferences.update", target: (_b, uid) => uid },
  },
  _POST,
);
