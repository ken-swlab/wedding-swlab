import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { lookupInvite } from "@/config/invites";

// ★firebase-admin は Edge Runtime では動作しない★
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;
// Custom Claims の実上限は 1000 バイト。余裕を持って弾く。
const CLAIMS_BYTE_LIMIT = 900;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: Request) {
  // ★Phase 5.5 で「登録 → 管理者承認」フローに移行したため既定で無効★
  //   有効なままだと、ゲストが承認を飛ばして自分でタグを取得できてしまう。
  //   合言葉方式に戻したい場合のみ ENABLE_INVITE_CODES=true を設定する。
  if (process.env.ENABLE_INVITE_CODES !== "true") {
    return fail("招待コードの受付は終了しました", 410);
  }

  const { auth, db } = admin();

  // ---- 1. ID トークンの検証 --------------------------------
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  let uid: string;
  try {
    // 第2引数 true = 失効チェック（サインアウト済みトークンを弾く）
    const decoded = await auth.verifyIdToken(idToken, true);
    uid = decoded.uid;
  } catch {
    return fail("サインインし直してください", 401);
  }

  // ---- 2. 入力の検証 ---------------------------------------
  let code: unknown;
  try {
    ({ code } = (await req.json()) as { code?: unknown });
  } catch {
    return fail("リクエストが不正です", 400);
  }
  if (typeof code !== "string" || !code.trim() || code.length > 64) {
    return fail("招待コードを入力してください", 400);
  }

  // ---- 3. 総当たり対策 -------------------------------------
  // サーバーレスではプロセス内カウンタが共有されないため Firestore で数える。
  const attemptRef = db.collection("redeemAttempts").doc(uid);
  const now = Date.now();

  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(attemptRef);
    const data = snap.data();
    const windowStart: number = data?.windowStart ?? 0;
    const count: number = data?.count ?? 0;

    if (now - windowStart > WINDOW_MS) {
      tx.set(attemptRef, { windowStart: now, count: 1 });
      return true;
    }
    if (count >= MAX_ATTEMPTS) return false;

    tx.set(attemptRef, { count: count + 1 }, { merge: true });
    return true;
  });

  if (!allowed) {
    return fail("試行回数が多すぎます。10分ほど時間をおいてください", 429);
  }

  // ---- 4. コードの照合 -------------------------------------
  const invite = lookupInvite(code);
  if (!invite) return fail("招待コードが見つかりません", 404);

  // ---- 5. Custom Claims の付与 -----------------------------
  // ★setCustomUserClaims は既存クレームを全置換する★
  //   必ず現在値を読んでからマージしないと、
  //   CTF で獲得済みのタグや admin フラグが消える。
  const user = await auth.getUser(uid);
  const prev = user.customClaims ?? {};
  const existingTags = Array.isArray(prev.tags) ? (prev.tags as string[]) : [];
  const tags = Array.from(new Set([...existingTags, ...invite.tags])).sort();

  const nextClaims = { ...prev, tags };
  if (Buffer.byteLength(JSON.stringify(nextClaims), "utf8") > CLAIMS_BYTE_LIMIT) {
    return fail("付与できるタグ数の上限に達しました", 409);
  }

  await auth.setCustomUserClaims(uid, nextClaims);

  // ---- 6. ゲスト情報の記録 ---------------------------------
  // Admin SDK は Security Rules をバイパスするので、
  // Phase 3 のルールを変更せずに書き込める。
  const batch = db.batch();

  // 全ゲストが読める側：招待コードそのものは絶対に入れない
  batch.set(
    db.collection("guests").doc(uid),
    {
      tags,
      features: invite.features ?? {},
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // 運営専用（catch-all ルールによりクライアントからは読めない）
  batch.set(
    db.collection("guestAdmin").doc(uid),
    {
      uid,
      inviteCode: invite.code,
      inviteLabel: invite.label,
      grantedTags: invite.tags,
      isAnonymous: user.providerData.length === 0,
      redeemedAt: FieldValue.serverTimestamp(),
      // 将来: rsvp / lineUserId / nickname / giftSentAt をここに足していく
    },
    { merge: true },
  );

  await batch.commit();

  return NextResponse.json({
    ok: true,
    tags,
    grantedTags: invite.tags,
    label: invite.label,
    welcomeMessage: invite.welcomeMessage,
    features: invite.features ?? {},
  });
}
