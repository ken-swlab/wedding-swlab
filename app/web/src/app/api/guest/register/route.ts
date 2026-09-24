import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { ATTENDANCE_OPTIONS } from "@/types/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATTENDANCE_VALUES = new Set<string>(ATTENDANCE_OPTIONS.map((o) => o.value));

/** 1ユーザーあたりの試行回数。超えるとロックする */
const MAX_ATTEMPTS = 5;
/** ロック時間（分） */
const LOCK_MINUTES = 30;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/**
 * パスコードの正規化。
 *
 * ★NFKC が必須★
 *   日本語 IME では全角数字（１１０８）が普通に入力される。
 *   正規化しないと当日「合っているのに通らない」問い合わせが必ず出る。
 *   スペースとハイフン類も落として、見た目どおりに通るようにする。
 */
function normalizePasscode(s: string): string {
  return s.normalize("NFKC").replace(/[\s\-‐−ー―]/g, "").trim();
}

/** 比較時間から桁を推測されないようにする */
function passcodeMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
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

  let body: {
    realName?: unknown; kana?: unknown; nickname?: unknown;
    attendance?: unknown; allergy?: unknown; passcode?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("リクエストが不正です", 400);
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const realName = str(body.realName);
  const nickname = str(body.nickname);
  const kana = str(body.kana);
  const allergy = str(body.allergy);

  if (!realName || realName.length > 40) return fail("お名前は1〜40文字で入力してください", 400);
  if (!nickname || nickname.length > 20) return fail("ニックネームは1〜20文字で入力してください", 400);
  if (kana.length > 40) return fail("ふりがなは40文字までです", 400);
  if (allergy.length > 500) return fail("アレルギー情報は500文字までです", 400);
  if (typeof body.attendance !== "string" || !ATTENDANCE_VALUES.has(body.attendance)) {
    return fail("出欠の選択が不正です", 400);
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
   * ★2回目以降はパスコードを求めない★
   *   要件どおり、一度登録したら LINE セッションだけで入れる。
   *   入力内容の修正で毎回パスコードを聞かれるのは体験として重い。
   *   isRegistered を true にできるのはこのルートだけなので、
   *   「一度はパスコードを通った」ことの証明になっている。
   */
  const alreadyRegistered = publicSnap.get("isRegistered") === true;

  if (!alreadyRegistered) {
    const expectedRaw = process.env.WEDDING_PASSCODE ?? "";
    if (!expectedRaw) {
      // 環境変数名はクライアントに出さない。サーバーログにだけ残す
      console.error("[guest/register] WEDDING_PASSCODE が未設定です");
      return fail("ただいま受付を準備中です。しばらくしてからお試しください", 503);
    }

    const now = Date.now();
    const att = (adminSnap.get("passcodeAttempts") ?? {}) as {
      count?: number; lockedUntil?: number;
    };
    const lockedUntil = typeof att.lockedUntil === "number" ? att.lockedUntil : 0;

    if (lockedUntil > now) {
      const min = Math.ceil((lockedUntil - now) / 60000);
      return fail(`試行回数の上限に達しました。約${min}分後にもう一度お試しください`, 429);
    }

    // ロック期間が明けていたらカウンタをリセットしてから数え直す
    const count = lockedUntil > 0 && lockedUntil <= now ? 0 : (att.count ?? 0);
    const given = normalizePasscode(str(body.passcode));

    if (!given) return fail("パスコードを入力してください", 400);

    if (!passcodeMatches(given, normalizePasscode(expectedRaw))) {
      const next = count + 1;
      const locking = next >= MAX_ATTEMPTS;
      await adminRef.set(
        {
          uid,
          passcodeAttempts: {
            count: next,
            firstAt: att.count ? (adminSnap.get("passcodeAttempts")?.firstAt ?? now) : now,
            lockedUntil: locking ? now + LOCK_MINUTES * 60000 : 0,
            lastAt: now,
          },
        },
        { merge: true },
      );
      console.warn(`[guest/register] パスコード不一致 uid=${uid} ${next}/${MAX_ATTEMPTS}`);

      if (locking) {
        return fail(`パスコードが違います。試行回数の上限に達したため、約${LOCK_MINUTES}分お待ちください`, 429);
      }
      return fail(`パスコードが違います（あと${MAX_ATTEMPTS - next}回）`, 403);
    }
  }

  const publicPatch: Record<string, unknown> = {
    realName, nickname, isRegistered: true, updatedAt: FieldValue.serverTimestamp(),
  };
  if (kana) publicPatch.kana = kana;
  if (publicSnap.get("isApproved") === undefined) publicPatch.isApproved = false;

  const privatePatch: Record<string, unknown> = {
    uid, attendance: body.attendance, allergy, submittedAt: FieldValue.serverTimestamp(),
  };
  if (privateSnap.get("paymentStatus") === undefined) privatePatch.paymentStatus = "none";
  if (privateSnap.get("isActive") === undefined) privatePatch.isActive = true;

  const batch = db.batch();
  batch.set(publicRef, publicPatch, { merge: true });
  batch.set(privateRef, privatePatch, { merge: true });
  // 通過したら試行回数を消す
  if (!alreadyRegistered) {
    batch.set(
      adminRef,
      { uid, passcodeAttempts: FieldValue.delete(), passcodeClearedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();

  return NextResponse.json({ ok: true, nickname });
}
