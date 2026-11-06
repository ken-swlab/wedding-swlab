import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { isPasscodeCleared } from "@/lib/passcode-server";
import { invitationConfig } from "@/lib/invitation-server";
import { paymentConfig } from "@/lib/payment-server";
import { createServerTiming } from "@/lib/server-timing";
import type { InvitationStatus } from "@/types/invitation";
import type { InvitationKind } from "@/types/admin";
import { storedInvitationKind } from "@/lib/answers-server";

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
 * ★?kind=family なら親族用（config/invitation_family。Issue #240）★
 *   未設定なら ready: false（友人用の中身で代わりに出さない）。会費は返さない（親族は会費なし）。
 *   ★URL を書き換えれば友人も親族用を見られる★（パスコードは共通。オーナー了承済み）。親族用に秘密の値を入れない。
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

  /**
   * ★招待状の中身・会費の読み込みも、ゲスト情報と同時に始める★（Issue #277。順番に待たない）
   *   種類（?kind=）が URL で分かるときだけ。★読んだ中身を返すのは、パスコードを通った人にだけ★（下の cleared の判定は変えない）。
   *   中身は 60 秒キャッシュ（invitation-server.ts・payment-server.ts）なので、通っていない人の分を読んでも重くない。
   */
  const timing = createServerTiming();
  const kindParam = new URL(req.url).searchParams.get("kind");
  const kindHint: InvitationKind | null = kindParam === "family" || kindParam === "friend" ? kindParam : null;
  const configEarly = kindHint ? timing.time("config", invitationConfig(kindHint)) : null;
  const paymentEarly = kindHint === "friend" ? timing.time("payment", paymentConfig()) : null;
  configEarly?.catch(() => {});
  paymentEarly?.catch(() => {});

  const [publicSnap, privateSnap, adminSnap] = await timing.time(
    "guest_read",
    Promise.all([
      db.collection("guests").doc(uid).get(),
      db.collection("guestPrivate").doc(uid).get(),
      db.collection("guestAdmin").doc(uid).get(),
    ]),
  );

  if (privateSnap.get("isActive") === false) {
    return fail("このアカウントはご利用いただけません", 403);
  }

  const registered = publicSnap.get("isRegistered") === true;
  const cleared = isAdmin || isPasscodeCleared(publicSnap, adminSnap);
  // ★?kind= が無ければ、回答のときに記録した種類★（承認待ち・回答の修正・登録フォームの当日の流れを、本人の招待状に合わせる）
  const kind: InvitationKind = kindHint ?? storedInvitationKind(privateSnap);
  const config = cleared ? await (configEarly ?? timing.time("config", invitationConfig(kind))) : null;
  let res: InvitationStatus;
  if (config && kind === "family") {
    const { opening, ...invitation } = config;
    res = { kind, cleared, registered, ready: true, invitation, opening };
  } else if (config) {
    const { opening, ...invitation } = config;
    // 会費は config/payment から（Issue #148）。★お車代の額は返さない★（招待状に出さない）
    const payment = await (paymentEarly ?? timing.time("payment", paymentConfig()));
    const fee = payment
      ? { partyYen: payment.partyYen, secondYen: payment.secondYen, ...(payment.secondTentative ? { secondTentative: true } : {}) }
      : undefined;
    res = { kind, cleared, registered, ready: true, invitation: fee ? { ...invitation, fee } : invitation, opening };
  } else {
    res = { kind, cleared, registered, ready: false };
  }
  return NextResponse.json(
    { ok: true, ...res },
    // どの読み込みに時間がかかったか（名前と時間だけ。Issue #277）
    { headers: { "Cache-Control": "private, no-store", "Server-Timing": timing.header() } },
  );
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _GET の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const GET = withGuard({ name: "guest.invitation", auth: "user", rateLimit: { key: "uid", limit: 30, windowSec: 60 } }, _GET);
