import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { readCustomTags } from "@/lib/tags-server";
import { MAX_TAG_LABEL, PALETTE_KEYS, TAG_DEFS, isCustomTagId } from "@/config/tags";
import { withGuard } from "@/lib/route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CUSTOM_TAGS = 60;
const PALETTES = new Set<string>(PALETTE_KEYS);
const BUILTIN_LABELS = new Set(TAG_DEFS.map((t) => t.label));

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

type Guard =
  | { ok: true; db: Firestore; uid: string }
  | { ok: false; res: NextResponse };

async function guard(req: Request): Promise<Guard> {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return { ok: false, res: fail("認証情報がありません", 401) };
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    if (decoded.admin !== true) return { ok: false, res: fail("管理者権限が必要です", 403) };
    return { ok: true, db, uid: decoded.uid };
  } catch {
    return { ok: false, res: fail("ログインし直してください", 401) };
  }
}

async function _GET(req: Request) {
  try {
    const g = await guard(req);
    if (!g.ok) return g.res;
    const tags = await readCustomTags(g.db);
    return NextResponse.json({ ok: true, tags });
  } catch (e) {
    console.error("[tags] GET", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}

async function _POST(req: Request) {
  try {
    const g = await guard(req);
    if (!g.ok) return g.res;

    let body: { label?: unknown; palette?: unknown; selectable?: unknown; community?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return fail("リクエストが不正です", 400);
    }

    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) return fail("タグ名を入力してください", 400);
    if (label.length > MAX_TAG_LABEL) return fail(`タグ名は${MAX_TAG_LABEL}文字までです`, 400);

    const palette =
      typeof body.palette === "string" && PALETTES.has(body.palette) ? body.palette : "stone";
    const selectable = body.selectable !== false;
    // ★既定は false★ 勝手にギャラリーの人物検索スコープを広げない
    const community = body.community === true;

    const existing = await readCustomTags(g.db);
    if (existing.length >= MAX_CUSTOM_TAGS) {
      return fail(`カスタムタグは${MAX_CUSTOM_TAGS}個までです`, 400);
    }
    if (BUILTIN_LABELS.has(label) || existing.some((t) => !t.archived && t.label === label)) {
      return fail(`「${label}」は既に存在します`, 400);
    }

    const doc = {
      label,
      palette,
      selectable,
      community,
      archived: false,
      order: existing.length,
      createdAt: Date.now(),
      createdBy: g.uid,
    };

    // ドキュメント ID の一意性で衝突を構造的に防ぐ。
    // create() は既存 ID があれば必ず失敗するので、握りつぶさず最後に報告する。
    let id = "";
    let lastErr: unknown = null;
    for (let i = 0; i < 5 && !id; i += 1) {
      const candidate = `c_${randomBytes(4).toString("hex")}`;
      try {
        await g.db.collection("tags").doc(candidate).create(doc);
        id = candidate;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!id) {
      console.error("[tags] 採番に失敗", lastErr);
      return fail(
        `タグの作成に失敗しました: ${lastErr instanceof Error ? lastErr.message : "不明なエラー"}`,
        500,
      );
    }

    return NextResponse.json({ ok: true, tag: { id, ...doc } });
  } catch (e) {
    console.error("[tags] POST", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}

async function _PATCH(req: Request) {
  try {
    const g = await guard(req);
    if (!g.ok) return g.res;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return fail("リクエストが不正です", 400);
    }

    const id = typeof body.id === "string" ? body.id : "";
    if (!isCustomTagId(id)) return fail("組み込みタグは変更・削除できません", 400);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (typeof body.label === "string") {
      const label = body.label.trim();
      if (!label || label.length > MAX_TAG_LABEL) {
        return fail(`タグ名は1〜${MAX_TAG_LABEL}文字です`, 400);
      }
      patch.label = label;
    }
    if (typeof body.palette === "string" && PALETTES.has(body.palette)) patch.palette = body.palette;
    if (typeof body.selectable === "boolean") patch.selectable = body.selectable;
    if (typeof body.community === "boolean") patch.community = body.community;
    // ★物理削除はしない★
    //   Custom Claims と episodes.visibleToTags に残った ID を壊さないため、
    //   削除は archived による論理削除だけを提供する。
    if (typeof body.archived === "boolean") patch.archived = body.archived;
    if (typeof body.order === "number") patch.order = body.order;

    const ref = g.db.collection("tags").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return fail("そのタグは存在しません", 404);
    await ref.set(patch, { merge: true });

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("[tags] PATCH", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _GET/_POST/_PATCH の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const GET = withGuard({ name: "admin.tags.list", auth: "admin", rateLimit: { key: "uid", limit: 120, windowSec: 60 } }, _GET);
export const POST = withGuard({ name: "admin.tags.create", auth: "admin", rateLimit: { key: "uid", limit: 30, windowSec: 60 }, audit: { action: "tag.create" } }, _POST);
export const PATCH = withGuard({ name: "admin.tags.update", auth: "admin", rateLimit: { key: "uid", limit: 60, windowSec: 60 }, audit: { action: "tag.update", target: (b) => b.id } }, _PATCH);
