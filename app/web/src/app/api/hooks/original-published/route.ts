import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import type { MediaItem } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** u/{uid}/o/{uuid}.{ext} 以外は受け付けない。Worker の ORIGINAL_KEY_RE と一致させること */
const KEY_RE = /^u\/([A-Za-z0-9_.:-]{1,128})\/o\/[0-9a-fA-F-]{36}\.[a-z0-9]{1,8}$/;
/** 1ゲストの投稿をなめる上限。新しい順に見るので、古い投稿から溢れる */
const SCAN_LIMIT = 300;
/** 上限 64MB。これを超える bytes はそもそも Worker が処理できない */
const MAX_BYTES = 64 * 1024 * 1024;

/** UI に出す理由。Worker が送ってくる reason はこの集合に限る */
const SKIP_REASONS = new Set([
  "unsupported_format",
  "broken_file",
  "too_large",
  "missing",
  "unlinked_timeout",
  "webhook_failed",
  "hard_timeout",
]);

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/** 比較時間から秘密を推測されないようにする */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    /**
     * ★認証を何よりも先に通す★
     *   環境変数の有無を先に返していた頃は、未認証のまま
     *   「WORKER_WEBHOOK_SECRET が未設定です」が読めた。
     *   秘密の名前は、総当たりすべきヘッダ名のヒントになる。
     *   未設定なら比較対象が無いので 401 にし、詳細はログにだけ残す。
     */
    const expected = process.env.WORKER_WEBHOOK_SECRET ?? "";
    const given = req.headers.get("x-worker-secret") ?? "";
    if (!expected) {
      console.error("[hook] WORKER_WEBHOOK_SECRET が未設定です");
      return fail("認証に失敗しました", 401);
    }
    if (!given || !secretMatches(given, expected)) {
      return fail("認証に失敗しました", 401);
    }

    let body: { key?: unknown; bytes?: unknown; status?: unknown; reason?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return fail("リクエストが不正です", 400);
    }

    /**
     * ★ping は副作用を持たない★
     *   Worker が「この run で1件も成功していない」ときに、
     *   「この1枚が悪いのか / システム全体が落ちているのか」を
     *   区別するために撃つ。Firestore には一切触らない。
     *   これが 200 を返せるかどうかが、隔離を許可する条件になる。
     */
    if (body.status === "ping") {
      return NextResponse.json({ ok: true, pong: true });
    }

    const key = typeof body.key === "string" ? body.key : "";
    const m = KEY_RE.exec(key);
    if (!m) return fail("キーの形式が不正です", 400);
    const uid = m[1];

    const status = body.status === "skipped" ? "skipped" : "published";

    // ★公開 URL はサーバーが組み立てる★
    //   Worker から URL を受け取ると、秘密が漏れたときに
    //   任意の URL を差し込まれる。キーだけを信じる。
    let patch: Partial<MediaItem>;

    if (status === "skipped") {
      const reason = typeof body.reason === "string" ? body.reason : "";
      if (!SKIP_REASONS.has(reason)) return fail("理由が不正です", 400);
      patch = { originalStatus: "skipped", originalSkipReason: reason };
    } else {
      const base = process.env.R2_PUBLIC_BASE ?? "";
      if (!base) {
        console.error("[hook] R2_PUBLIC_BASE が未設定です");
        return fail("サーバー内部エラー", 500);
      }
      const raw = body.bytes;
      const bytes =
        typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw <= MAX_BYTES
          ? Math.floor(raw)
          : undefined;
      patch = {
        originalUrl: `${base.replace(/\/+$/, "")}/${key}`,
        originalStatus: "published",
        ...(bytes ? { originalBytes: bytes } : {}),
      };
    }

    const { db } = admin();

    /**
     * ★キーに含まれる uid で引く★
     *   media[] は配列の中のマップなので originalPath ではクエリできない。
     *   authorUid で絞ってから、その人の投稿の中だけを走査する。
     *
     * ★createdAt 降順を付ける★
     *   順序指定が無いと、300件を超えたゲストで新しい投稿が
     *   ヒットせず、202 を返し続けて最後は隔離されていた。
     *   複合インデックス (authorUid ASC, createdAt DESC) が必要。
     */
    const snap = await db
      .collection("posts")
      .where("authorUid", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(SCAN_LIMIT)
      .get();

    for (const doc of snap.docs) {
      const media = (doc.get("media") ?? []) as MediaItem[];
      const idx = media.findIndex((x) => x.originalPath === key);
      if (idx < 0) continue;

      // 同じ内容なら書かない（再通知や二重配信がありうる）
      const cur = media[idx];
      if (
        cur.originalStatus === patch.originalStatus &&
        cur.originalUrl === patch.originalUrl &&
        cur.originalSkipReason === patch.originalSkipReason
      ) {
        return NextResponse.json({ ok: true, matched: true, unchanged: true });
      }

      const next = media.map((x, i) => (i === idx ? { ...x, ...patch } : x));

      await doc.ref.update({ media: next, updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true, matched: true, postId: doc.id, status });
    }

    /**
     * ★202 はエラーではない★
     *   クライアントは「R2 へ PUT → Firestore へ attachOriginal」の順なので、
     *   この Webhook のほうが先に着くことがある。Worker 側はこれを見て
     *   少し待ってから再試行する。500 を返すと即時リトライで空回りする。
     */
    return NextResponse.json({ ok: true, matched: false }, { status: 202 });
  } catch (e) {
    // 詳細はサーバーログだけに残す。Firestore のインデックス URL には
    // プロジェクト ID・コレクション名・フィールド名が乗る
    console.error("[hook/original-published]", e);
    return fail("サーバー内部エラー", 500);
  }
}
