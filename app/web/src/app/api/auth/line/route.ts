import { after, NextResponse } from "next/server";
import type { UserRecord } from "firebase-admin/auth";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { createServerTiming } from "@/lib/server-timing";

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

/**
 * ID トークン（JWT）の中の sub を、確かめずに取り出す（Issue #277）。★読み込みを早く始めるためだけに使う★
 *   値を信じて何かを書いたり返したりしない。使うのは、LINE の確認で同じ sub と分かったあとだけ（_POST の★参照）。
 */
function unverifiedSub(idToken: string): string | null {
  try {
    const part = idToken.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { sub?: unknown };
    return typeof json.sub === "string" && /^U[0-9a-f]{32}$/.test(json.sub) ? json.sub : null;
  } catch {
    return null;
  }
}

type LineUserRead = { user: UserRecord | null; guests: DocumentSnapshot | null; guestPrivate: DocumentSnapshot | null };

/** Firebase の利用者と、ゲスト情報（guests・guestPrivate）を同時に読む。利用者がいなければ user: null */
async function readLineUser(uid: string): Promise<LineUserRead> {
  const { auth, db } = admin();
  const [user, guests, guestPrivate] = await Promise.all([
    auth.getUser(uid).catch((e: unknown) => {
      if ((e as { code?: string }).code === "auth/user-not-found") return null;
      throw e;
    }),
    db.collection("guests").doc(uid).get(),
    db.collection("guestPrivate").doc(uid).get(),
  ]);
  return { user, guests, guestPrivate };
}

async function _POST(req: Request) {
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

  const { auth, db } = admin();
  const timing = createServerTiming();

  /**
   * ★LINE の確認と、Firebase の読み込みを同時に始める★（Issue #277。順番に待つと、往復の時間が積み重なる）
   *   ID トークンの中の sub（まだ確かめていない値）で、先に Firebase の利用者とゲスト情報を読み始める。
   *   ★読んだ値を使うのは、LINE の確認が通り、確かめた sub と同じだったときだけ★ 違えば、確かめた sub で読み直す。
   *   確認の前に読むのは読み込みだけで、書き込みはしない（確かめていない値で何も変えない）。
   */
  const guessedSub = unverifiedSub(idToken);
  const earlyRead = guessedSub ? readLineUser(`line:${guessedSub}`) : null;
  // 確認に失敗して使わなかったときに、「受け取られなかった Promise の失敗」にしない
  earlyRead?.catch(() => {});

  // ---- 1. LINE 側で ID トークンを検証 ----------------------
  const verified = await timing.time(
    "line_verify",
    fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
      cache: "no-store",
    }),
  );

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

  const read = await timing.time(
    "firebase_read",
    guessedSub === payload.sub && earlyRead ? earlyRead : readLineUser(uid),
  );
  const isNew = read.user === null;

  if (read.user) {
    // LINE 側で名前やアイコンを変えた場合に追従する。★変わっていなければ書かない★（Issue #277）
    const patch: Record<string, string> = {};
    if (read.user.displayName !== displayName) patch.displayName = displayName;
    if (photoURL && read.user.photoURL !== photoURL) patch.photoURL = photoURL;
    if (Object.keys(patch).length > 0) await timing.time("auth_update", auth.updateUser(uid, patch));
  } else {
    await timing.time("auth_create", auth.createUser({ uid, displayName, ...(photoURL ? { photoURL } : {}) }));
  }

  // ---- 3. プロフィールを Firestore に反映 ------------------
  /**
   * ★本人が設定したアイコン（photoSource: "custom"）は LINE の画像で上書きしない★
   *   設定画面（/api/guest/profile）で変えたアイコンが、次のログインで LINE の画像に戻ってしまう。
   *   LINE の画像は上の Auth のユーザーには反映しているので、「LINE のアイコンに戻す」はそこから引く。
   * ★変わっていなければ書かない★（Issue #277）初めての人・表示名かアイコンが変わった人・ゲスト情報が無い人だけ書く。
   */
  const customPhoto = !isNew && read.guests?.get("photoSource") === "custom";
  const guestsNeedsWrite =
    isNew || !read.guests?.exists || (!!photoURL && !customPhoto && read.guests.get("photoURL") !== photoURL);
  const privateNeedsWrite = isNew || !read.guestPrivate?.exists || read.guestPrivate.get("lineDisplayName") !== displayName;

  const batch = db.batch();
  /**
   * ★guests には表示名を書かない★
   *   LINE の表示名は本名を設定している人が多い。guests は
   *   サインイン済みゲストが list できるので、氏名は guestPrivate へ。
   *   アイコン（photoURL）は投稿者アバターとして他のゲストに
   *   見せる前提のものなので guests に残す。
   */
  if (guestsNeedsWrite) {
    batch.set(
      db.collection("guests").doc(uid),
      {
        uid,
        ...(photoURL && !customPhoto ? { photoURL } : {}),
        ...(isNew
          ? { nickname: "", isRegistered: false, isApproved: false, createdAt: FieldValue.serverTimestamp() }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  if (privateNeedsWrite) {
    batch.set(
      db.collection("guestPrivate").doc(uid),
      { uid, lineDisplayName: displayName, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  // 初めての人は、運営情報も応答の前に作る（ほかの API が読むため）
  if (isNew) {
    batch.set(
      db.collection("guestAdmin").doc(uid),
      { uid, lineUserId: payload.sub, isAnonymous: false, firstLoginAt: FieldValue.serverTimestamp(), lastLoginAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

  // ---- 4. カスタムトークンの発行（書き込みと同時に）---------
  // ★サービスアカウントの秘密鍵で署名する★
  //   ADC だけの環境では auth/insufficient-permission になるため、
  //   FIREBASE_SERVICE_ACCOUNT_B64 が必須。
  //   既存の Custom Claims (tags / admin) はユーザー側に保存されているので
  //   ここで渡さなくても ID トークンに引き継がれる。
  const writes = guestsNeedsWrite || privateNeedsWrite || isNew;
  const [customToken] = await Promise.all([
    timing.time("custom_token", auth.createCustomToken(uid)),
    writes ? timing.time("firestore_write", batch.commit()) : Promise.resolve(),
  ]);

  /**
   * ★最後にログインした時刻は、応答を返したあとで書く★（Issue #277。after）ログインの待ち時間に入れない。
   *   運営情報（guestAdmin。管理者だけが読む）の印で、画面の表示には使っていない。書けなくてもログインは止めない。
   */
  if (!isNew) {
    after(async () => {
      try {
        await db
          .collection("guestAdmin")
          .doc(uid)
          .set({ uid, lineUserId: payload.sub, isAnonymous: false, lastLoginAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (e) {
        console.error("[auth/line] 最後のログインの記録に失敗しました", e);
      }
    });
  }

  return NextResponse.json(
    { ok: true, customToken, isNew, displayName },
    // どの読み書きに時間がかかったか（名前と時間だけ。Issue #277）
    { headers: { "Server-Timing": timing.header() } },
  );
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の認証（Worker の共有シークレット／LINE の検証）はそのまま残している。
export const POST = withGuard({ name: "auth.line", auth: "none", maintenanceExempt: true, rateLimit: { key: "ip", limit: 300, windowSec: 60 } }, _POST);
