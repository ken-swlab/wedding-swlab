import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { expectedPasscode, isPasscodeCleared, normalizePasscode, passcodeMatches } from "@/lib/passcode-server";
import { PASSCODE_LOCK_MINUTES, PASSCODE_MAX_ATTEMPTS } from "@/config/passcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function _POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[guest/passcode] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

type Outcome =
  | { kind: "cleared" }
  | { kind: "locked"; minutes: number }
  | { kind: "wrong"; count: number; locking: boolean };

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

  let body: { passcode?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("リクエストが不正です", 400);
  }
  const given = normalizePasscode(typeof body.passcode === "string" ? body.passcode : "");
  if (!given || given.length > 16) return fail("パスコードを入力してください", 400);

  const publicRef = db.collection("guests").doc(uid);
  const privateRef = db.collection("guestPrivate").doc(uid);
  const adminRef = db.collection("guestAdmin").doc(uid);

  const [publicSnap, privateSnap, adminSnap] = await Promise.all([
    publicRef.get(), privateRef.get(), adminRef.get(),
  ]);

  // ★停止されたユーザーはパスコードからやり直しても入れない★
  if (privateSnap.get("isActive") === false) {
    return fail("このアカウントはご利用いただけません", 403);
  }
  if (isPasscodeCleared(publicSnap, adminSnap)) {
    return NextResponse.json({ ok: true });
  }

  const expected = expectedPasscode();
  if (!expected) return fail("ただいま受付を準備中です。しばらくしてからお試しください", 503);

  /**
   * ★試行回数はトランザクションで数える★
   *   読んでから書くまでの間に別のリクエストが割り込むと、同じ count を
   *   何度も読んで上限を超えて試せてしまう（4桁は総当たりが現実的な桁数）。
   *   トランザクションなら競合したほうが読み直すので、1回ずつ確実に数えられる。
   */
  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const snap = await tx.get(adminRef);
    if (snap.get("passcodeClearedAt") != null) return { kind: "cleared" };

    const now = Date.now();
    const att = (snap.get("passcodeAttempts") ?? {}) as {
      count?: number; firstAt?: number; lockedUntil?: number;
    };
    const lockedUntil = typeof att.lockedUntil === "number" ? att.lockedUntil : 0;
    if (lockedUntil > now) {
      return { kind: "locked", minutes: Math.ceil((lockedUntil - now) / 60000) };
    }

    if (passcodeMatches(given, expected)) {
      tx.set(
        adminRef,
        { uid, passcodeAttempts: FieldValue.delete(), passcodeClearedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      return { kind: "cleared" };
    }

    // ロック期間が明けていたらカウンタをリセットしてから数え直す
    const prev = lockedUntil > 0 ? 0 : (att.count ?? 0);
    const count = prev + 1;
    const locking = count >= PASSCODE_MAX_ATTEMPTS;
    tx.set(
      adminRef,
      {
        uid,
        passcodeAttempts: {
          count,
          firstAt: prev > 0 ? (att.firstAt ?? now) : now,
          lockedUntil: locking ? now + PASSCODE_LOCK_MINUTES * 60000 : 0,
          lastAt: now,
        },
      },
      { merge: true },
    );
    return { kind: "wrong", count, locking };
  });

  if (outcome.kind === "cleared") return NextResponse.json({ ok: true });

  // 文言の「上限」で画面が入力欄を閉じる（PasscodeStep.tsx）
  if (outcome.kind === "locked") {
    return fail(`入力の回数が上限に達しています。お手数ですが、約${outcome.minutes}分後にもう一度お試しください`, 429);
  }

  // 想定内の失敗なので Sentry には送らない（console.warn）
  console.warn(`[guest/passcode] パスコード不一致 uid=${uid} ${outcome.count}/${PASSCODE_MAX_ATTEMPTS}`);
  if (outcome.locking) {
    return fail(`入力の回数が上限に達しました。お手数ですが、約${PASSCODE_LOCK_MINUTES}分おいてからもう一度お試しください`, 429);
  }
  return fail(`パスコードが違うようです。もう一度ご入力ください（あと${PASSCODE_MAX_ATTEMPTS - outcome.count}回）`, 403);
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
//   ★監査ログに残るのは本文のキー名だけ★ パスコードの値は残らない。
export const POST = withGuard({ name: "guest.passcode", auth: "user", rateLimit: { key: "uid", limit: 10, windowSec: 60 }, audit: { action: "guest.passcode", target: (_b, uid) => uid } }, _POST);
