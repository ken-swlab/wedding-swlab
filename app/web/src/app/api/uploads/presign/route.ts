import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase-admin";
import {
  contentTypesFor,
  maxBytesFor,
  newKey,
  ownsKey,
  presignPut,
  publicUrlOf,
  type UploadKind,
} from "@/lib/r2-server";
import { mb } from "@/config/limits";
import { withGuard } from "@/lib/route-guard";

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

async function _POST(req: Request) {
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

    // ★許可形式は kind ごとに違う★
    //   原本は Worker の formats.ts が処理できる形式だけ。
    //   HEIC を通すと「アップロードできたのに必ず隔離される」状態になる。
    if (!contentTypesFor(kind).has(contentType)) {
      return fail(
        kind === "original"
          ? `この形式は高画質版として保存できません（${contentType || "不明"}）。JPEG / PNG / WebP のみ対応しています`
          : `この形式はアップロードできません（${contentType || "不明"}）`,
        400,
      );
    }

    let key: string;
    if (typeof body.key === "string" && body.key) {
      // ★kind と名前空間の一致まで検証する★
      //   ここを uid の前置だけで通していた頃は、kind:"thumb" に o/ のキーを
      //   渡すだけで EXIF 付き原本を公開バケットへ PUT できた。
      if (!ownsKey(uid, body.key, kind)) {
        return fail("このキーへの権限がありません", 403);
      }
      key = body.key;
    } else {
      key = newKey(uid, kind, typeof body.ext === "string" ? body.ext : "");
    }

    // 公開 URL を返すのは公開バケットのときだけ。
    // 原本は非公開なので、ここで URL を作ってはいけない。
    const publicUrl = kind === "thumb" ? publicUrlOf(key) : null;

    // ★サイズ検証は reserveOnly でも行う★
    //   予約時に上限を知らせておかないと、ゲストは数十MBを送り切ってから
    //   初めて失敗を知ることになる。
    const limit = maxBytesFor(kind);
    if (Number.isFinite(bytes) && bytes > limit) {
      return fail(`サイズが上限（${mb(limit)}MB）を超えています`, 400);
    }

    if (reserveOnly) {
      // 原本は「いつ送るか分からない」ので、投稿時点ではキーだけ確保する。
      // 署名は寿命が短いため、実際に送る直前に取り直す。
      return NextResponse.json({ ok: true, key, publicUrl, maxBytes: limit });
    }

    if (!Number.isFinite(bytes) || bytes <= 0) {
      return fail("ファイルサイズが不正です", 400);
    }

    const url = await presignPut(kind, key, contentType, bytes);
    return NextResponse.json({ ok: true, key, url, publicUrl, maxBytes: limit });
  } catch (e) {
    // 詳細はサーバーログだけに残す。環境変数名や内部構造を返さない
    console.error("[presign]", e);
    return fail("サーバー内部エラー", 500);
  }
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const POST = withGuard({ name: "uploads.presign", auth: "user", rateLimit: { key: "uid", limit: 120, windowSec: 60 } }, _POST);
