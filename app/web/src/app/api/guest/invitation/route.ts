import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { isPasscodeCleared } from "@/lib/passcode-server";
import { invitationConfig } from "@/lib/invitation-server";
import { paymentConfig } from "@/lib/payment-server";
import type { InvitationStatus } from "@/types/invitation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function _GET(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[guest/invitation] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * 招待状の中身を返す。
 *
 * ★パスコードを通った人にだけ返す★
 *   名前・会場・住所はクライアントのバンドルにもリポジトリにも置かず、Firestore の config/invitation から
 *   読んでここからだけ渡す（src/lib/invitation-server.ts 参照）。通っていなければ中身なしで
 *   cleared: false を返し、画面はパスコード入力を出す。
 * ★オープニング用の名前の表記一式も、同じ条件で一緒に返す★（Issue #131）
 * ★会費（会食・2次会）は config/payment から一緒に返す★ お車代の額は返さない（Issue #148）。
 * ★config/invitation が未設定なら ready: false★ 架空の名前は返さない。画面は「準備中」を出す。
 */
async function handle(req: Request) {
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

  if (privateSnap.get("isActive") === false) {
    return fail("このアカウントはご利用いただけません", 403);
  }

  const registered = publicSnap.get("isRegistered") === true;
  const cleared = isAdmin || isPasscodeCleared(publicSnap, adminSnap);
  const config = cleared ? await invitationConfig() : null;
  let res: InvitationStatus;
  if (config) {
    const { opening, ...invitation } = config;
    // 会費は config/payment から（Issue #148）。★お車代の額は返さない★（招待状に出さない）
    const payment = await paymentConfig();
    const fee = payment ? { partyYen: payment.partyYen, secondYen: payment.secondYen } : undefined;
    res = { cleared, registered, ready: true, invitation: fee ? { ...invitation, fee } : invitation, opening };
  } else {
    res = { cleared, registered, ready: false };
  }
  return NextResponse.json({ ok: true, ...res }, { headers: { "Cache-Control": "private, no-store" } });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _GET の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const GET = withGuard({ name: "guest.invitation", auth: "user", rateLimit: { key: "uid", limit: 30, windowSec: 60 } }, _GET);
