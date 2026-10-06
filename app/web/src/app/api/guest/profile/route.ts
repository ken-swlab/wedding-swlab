import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { ownsKey, publicUrlOf } from "@/lib/r2-server";
import { countChars } from "@/lib/text";
import { PROFILE_BIO_MAX, PROFILE_NICKNAME_MAX, type PhotoSource } from "@/config/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** アイコンとして受け付ける軽量版のキー（ブラウザで JPEG にしてから送る） */
const ICON_KEY_EXT_RE = /\.(jpg|jpeg|png|webp)$/;

/** 改行・タブなどの制御文字（名前と一言は1行で出す） */
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function _POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[guest/profile] 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * 本人のプロフィール（ニックネーム・一言・アイコン）を変える。
 *
 * ★guests への本人の書き込みはこのルートだけ★
 *   以前は Rules で本人に photoURL / bio の直接更新を許していたが、それだと長さや
 *   アイコンの URL の検証を迂回できる。Rules では閉じ、ここで検証してから Admin SDK で書く。
 * ★アイコンは URL ではなく R2 のキーで受け取る★
 *   任意の URL を通すと、他人の画像や外部の追跡用の画像をアイコンにできてしまう。
 *   本人の軽量版の名前空間（u/{uid}/t/）のキーだけを受け、公開 URL はサーバーが組み立てる。
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

  let body: { nickname?: unknown; bio?: unknown; iconKey?: unknown; iconSource?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("リクエストが不正です", 400);
  }

  const patch: Record<string, unknown> = {};

  if (body.nickname !== undefined) {
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    const n = countChars(nickname);
    if (n < 1 || n > PROFILE_NICKNAME_MAX) {
      return fail(`ニックネームは1〜${PROFILE_NICKNAME_MAX}文字で入力してください`, 400);
    }
    if (CONTROL_RE.test(nickname)) return fail("ニックネームに改行は使えません", 400);
    patch.nickname = nickname;
  }

  if (body.bio !== undefined) {
    const bio = typeof body.bio === "string" ? body.bio.trim() : "";
    if (countChars(bio) > PROFILE_BIO_MAX) return fail(`ひとことは${PROFILE_BIO_MAX}文字までです`, 400);
    if (CONTROL_RE.test(bio)) return fail("ひとことに改行は使えません", 400);
    patch.bio = bio;
  }

  if (body.iconKey !== undefined) {
    const key = typeof body.iconKey === "string" ? body.iconKey : "";
    if (!ownsKey(uid, key, "thumb") || !ICON_KEY_EXT_RE.test(key)) {
      return fail("アイコンの画像が不正です", 400);
    }
    patch.photoURL = publicUrlOf(key);
    patch.photoSource = "custom" satisfies PhotoSource;
  } else if (body.iconSource === "line") {
    // LINE のアイコンに戻す。LINE の画像はログインのたびに Auth のユーザーへ反映している
    const lineURL = (await auth.getUser(uid)).photoURL;
    patch.photoURL = lineURL ?? FieldValue.delete();
    patch.photoSource = "line" satisfies PhotoSource;
  } else if (body.iconSource !== undefined) {
    return fail("リクエストが不正です", 400);
  }

  if (Object.keys(patch).length === 0) return fail("変更する項目がありません", 400);

  const publicRef = db.collection("guests").doc(uid);
  const [publicSnap, privateSnap] = await Promise.all([
    publicRef.get(),
    db.collection("guestPrivate").doc(uid).get(),
  ]);

  // 承認済みのゲストだけ（承認待ちの人はタイムラインに出ないので、編集の画面も無い）
  if (!publicSnap.exists || publicSnap.get("isApproved") !== true) {
    return fail("承認されたゲストのみ変更できます", 403);
  }
  if (privateSnap.get("isActive") === false) {
    return fail("このアカウントはご利用いただけません", 403);
  }

  await publicRef.update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
//   監査ログに残るのは本文のキー名だけ（ニックネームや一言の中身は残らない）。
export const POST = withGuard(
  {
    name: "guest.profile.update",
    auth: "user",
    rateLimit: { key: "uid", limit: 20, windowSec: 60 },
    audit: { action: "profile.update", target: (_b, uid) => uid },
  },
  _POST,
);
