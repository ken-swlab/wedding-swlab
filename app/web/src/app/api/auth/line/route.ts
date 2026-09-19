import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const LINE_ISSUER = "https://access.line.me";

type LineVerifyResult = {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  name?: string;
  picture?: string;
};

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/**
 * LIFF ID は "{channelId}-{suffix}" 形式。
 * ハイフンより前が LINE ログインチャネルの Channel ID であり、
 * これが verify エンドポイントの client_id になる。
 * 明示指定したい場合は LINE_CHANNEL_ID が優先される。
 */
function lineChannelId(): string | null {
  const explicit = process.env.LINE_CHANNEL_ID?.trim();
  if (explicit) return explicit;

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim();
  if (!liffId) return null;

  const head = liffId.split("-")[0];
  return /^\d+$/.test(head) ? head : null;
}

export async function POST(req: Request) {
  const clientId = lineChannelId();
  if (!clientId) {
    return fail("NEXT_PUBLIC_LIFF_ID が未設定か形式が不正です", 500);
  }

  let idToken: unknown;
  try {
    ({ idToken } = (await req.json()) as { idToken?: unknown });
  } catch {
    return fail("リクエストが不正です", 400);
  }
  if (typeof idToken !== "string" || !idToken) {
    return fail("idToken がありません", 400);
  }

  // ---- 1. LINE 側で ID トークンを検証 ----------------------
  const verified = await fetch(LINE_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
    cache: "no-store",
  });

  if (!verified.ok) {
    // LINE は 400 + {error, error_description} を返す。
    // 原因（aud 不一致・失効など）はログにだけ残す。
    console.error("[auth/line] verify failed:", verified.status, await verified.text());
    return fail("LINE の認証に失敗しました", 401);
  }

  const payload = (await verified.json()) as LineVerifyResult;

  // LINE 側でも検証されるが、多層防御として自前でも確認する
  if (payload.iss !== LINE_ISSUER || payload.aud !== clientId || !payload.sub) {
    return fail("LINE の認証に失敗しました", 401);
  }
  if (payload.exp * 1000 < Date.now()) {
    return fail("ログイン情報の有効期限が切れています", 401);
  }

  // ---- 2. Firebase ユーザーの取得 / 作成 -------------------
  const uid = `line:${payload.sub}`;
  const displayName = payload.name?.slice(0, 40) || "ゲスト";
  const photoURL = payload.picture;

  const { auth, db } = admin();
  let isNew = false;

  try {
    const existing = await auth.getUser(uid);

    // LINE 側で名前やアイコンを変えた場合に追従する
    const patch: Record<string, string> = {};
    if (existing.displayName !== displayName) patch.displayName = displayName;
    if (photoURL && existing.photoURL !== photoURL) patch.photoURL = photoURL;
    if (Object.keys(patch).length > 0) await auth.updateUser(uid, patch);
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
    await auth.createUser({ uid, displayName, ...(photoURL ? { photoURL } : {}) });
    isNew = true;
  }

  // ---- 3. プロフィールを Firestore に反映 ------------------
  const batch = db.batch();

  batch.set(
    db.collection("guests").doc(uid),
    {
      displayName,
      ...(photoURL ? { photoURL } : {}),
      ...(isNew ? { createdAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    db.collection("guestAdmin").doc(uid),
    {
      uid,
      lineUserId: payload.sub,
      isAnonymous: false,
      lastLoginAt: FieldValue.serverTimestamp(),
      ...(isNew ? { firstLoginAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true },
  );

  await batch.commit();

  // ---- 4. カスタムトークンの発行 ---------------------------
  // ★サービスアカウントの秘密鍵で署名する★
  //   ADC だけの環境では auth/insufficient-permission になるため、
  //   FIREBASE_SERVICE_ACCOUNT_B64 が必須。
  //   既存の Custom Claims (tags / admin) はユーザー側に保存されているので
  //   ここで渡さなくても ID トークンに引き継がれる。
  const customToken = await auth.createCustomToken(uid);

  return NextResponse.json({ ok: true, customToken, isNew, displayName });
}
