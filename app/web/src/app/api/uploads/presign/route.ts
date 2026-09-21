import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_OBJECT_BYTES,
  MAX_THUMB_BYTES,
  newKey,
  ownsKey,
  presignPut,
  publicUrlOf,
  type UploadKind,
} from "@/lib/r2-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  kind?: unknown;
  ext?: unknown;
  contentType?: unknown;
  bytes?: unknown;
  /** 既存キーへの再署名。原本は後日送るので署名を取り直す */
  key?: unknown;
  /** キーの発番だけ行い、署名は返さない */
  reserveOnly?: unknown;
};

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: Request) {
  try {
    const { auth, db } = admin();

    // ★必ず firebase-admin でトークンを検証する★
    //   ここが唯一の関門。素通りさせると、誰でもバケットに書ける状態になる。
    const header = req.headers.get("authorization") ?? "";
    const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!idToken) return fail("認証情報がありません", 401);

    let uid: string;
    let isAdminCaller = false;
    try {
      const decoded = await auth.verifyIdToken(idToken, true);
      uid = decoded.uid;
      isAdminCaller = decoded.admin === true;
    } catch {
      return fail("ログインし直してください", 401);
    }

    // 承認済みゲストだけに許可する（Storage Rules の isApproved 相当）
    if (!isAdminCaller) {
      const g = await db.collection("guests").doc(uid).get();
      if (!g.exists || g.get("isApproved") !== true) {
        return fail("承認されたゲストのみアップロードできます", 403);
      }
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return fail("リクエストが不正です", 400);
    }

    // ★バケットは kind から決まる。クライアントは選べない★
    const kind: UploadKind = body.kind === "original" ? "original" : "thumb";
    const contentType = typeof body.contentType === "string" ? body.contentType : "";
    const bytes = typeof body.bytes === "number" ? body.bytes : 0;
    const reserveOnly = body.reserveOnly === true;

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return fail(`この形式はアップロードできません（${contentType || "不明"}）`, 400);
    }

    let key: string;
    if (typeof body.key === "string" && body.key) {
      if (!ownsKey(uid, body.key)) return fail("このキーへの権限がありません", 403);
      key = body.key;
    } else {
      key = newKey(uid, kind, typeof body.ext === "string" ? body.ext : "");
    }

    // 公開 URL を返すのは公開バケットのときだけ。
    // 原本は非公開なので、ここで URL を作ってはいけない。
    const publicUrl = kind === "thumb" ? publicUrlOf(key) : null;

    if (reserveOnly) {
      // 原本は「いつ送るか分からない」ので、投稿時点ではキーだけ確保する。
      // 署名は寿命が短いため、実際に送る直前に取り直す。
      return NextResponse.json({ ok: true, key, publicUrl });
    }

    const limit = kind === "thumb" ? MAX_THUMB_BYTES : MAX_OBJECT_BYTES;
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > limit) {
      return fail(`サイズが上限（${Math.round(limit / 1024 / 1024)}MB）を超えています`, 400);
    }

    const url = await presignPut(kind, key, contentType, bytes);
    return NextResponse.json({ ok: true, key, url, publicUrl });
  } catch (e) {
    console.error("[presign]", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}
