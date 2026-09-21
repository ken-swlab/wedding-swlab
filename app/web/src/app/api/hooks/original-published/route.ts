import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import type { MediaItem } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** u/{uid}/o/{uuid}.{ext} 以外は受け付けない */
const KEY_RE = /^u\/([A-Za-z0-9_.:-]{1,128})\/o\/[0-9a-fA-F-]{36}\.[a-z0-9]{1,8}$/;
/** 1ゲストの投稿をなめる上限。実運用では数十件に収まる */
const SCAN_LIMIT = 300;

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
    const expected = process.env.WORKER_WEBHOOK_SECRET ?? "";
    const base = process.env.R2_PUBLIC_BASE ?? "";
    if (!expected) return fail("WORKER_WEBHOOK_SECRET が未設定です", 500);
    if (!base) return fail("R2_PUBLIC_BASE が未設定です", 500);

    const given = req.headers.get("x-worker-secret") ?? "";
    if (!given || !secretMatches(given, expected)) {
      return fail("認証に失敗しました", 401);
    }

    let body: { key?: unknown; bytes?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return fail("リクエストが不正です", 400);
    }

    const key = typeof body.key === "string" ? body.key : "";
    const m = KEY_RE.exec(key);
    if (!m) return fail("キーの形式が不正です", 400);
    const uid = m[1];

    // ★公開 URL はサーバーが組み立てる★
    //   Worker から URL を受け取ると、秘密が漏れたときに
    //   任意の URL を差し込まれる。キーだけを信じる。
    const url = `${base.replace(/\/+$/, "")}/${key}`;
    const bytes = typeof body.bytes === "number" ? body.bytes : undefined;

    const { db } = admin();

    /**
     * ★キーに含まれる uid で引く★
     *   media[] は配列の中のマップなので originalPath ではクエリできない。
     *   authorUid の単一フィールドクエリ（自動インデックス）で絞ってから、
     *   その人の投稿の中だけを走査する。
     */
    const snap = await db
      .collection("posts")
      .where("authorUid", "==", uid)
      .limit(SCAN_LIMIT)
      .get();

    for (const doc of snap.docs) {
      const media = (doc.get("media") ?? []) as MediaItem[];
      const idx = media.findIndex((x) => x.originalPath === key);
      if (idx < 0) continue;

      // 同じ内容なら書かない（キューは at-least-once なので二重配信がある）
      if (media[idx].originalUrl === url) {
        return NextResponse.json({ ok: true, matched: true, unchanged: true });
      }

      const next = media.map((x, i) =>
        i === idx
          ? {
              ...x,
              originalUrl: url,
              ...(bytes ? { originalBytes: bytes } : {}),
              originalStatus: "uploaded" as const,
            }
          : x,
      );

      await doc.ref.update({ media: next, updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true, matched: true, postId: doc.id });
    }

    /**
     * ★202 はエラーではない★
     *   クライアントは「R2 へ PUT → Firestore へ attachOriginal」の順なので、
     *   この Webhook のほうが先に着くことがある。Worker 側はこれを見て
     *   少し待ってから再試行する。500 を返すと即時リトライで空回りする。
     */
    return NextResponse.json({ ok: true, matched: false }, { status: 202 });
  } catch (e) {
    console.error("[hook/original-published]", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}
