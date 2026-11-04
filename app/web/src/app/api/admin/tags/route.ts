import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { readCustomTags, readOrderedTags } from "@/lib/tags-server";
import { MAX_TAG_LABEL, PALETTE_KEYS, canEditTag, canHideTag, isBuiltinTagId, isCustomTagId } from "@/config/tags";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CUSTOM_TAGS = 60;
const PALETTES = new Set<string>(PALETTE_KEYS);

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
    return fail(safeMessage(e), 500);
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

    // 組み込みのタグ（上書きを重ねた名前）と作ったタグを並び順に
    const all = await readOrderedTags(g.db);
    const existing = all.filter((t) => t.custom === true);
    if (existing.length >= MAX_CUSTOM_TAGS) {
      return fail(`カスタムタグは${MAX_CUSTOM_TAGS}個までです`, 400);
    }
    if (all.some((t) => !t.archived && t.label === label)) {
      return fail(`「${label}」は既に存在します`, 400);
    }
    // ★作ったタグは並び順の最後に入れる★（Issue #248。組み込みのタグも含めた並び順の、一番大きい値の次）
    const order = all.reduce((m, t) => (typeof t.order === "number" ? Math.max(m, t.order + 1) : m), existing.length);

    const doc = {
      label,
      palette,
      selectable,
      community,
      archived: false,
      order,
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
      return fail("タグの作成に失敗しました。もう一度お試しください", 500);
    }

    return NextResponse.json({ ok: true, tag: { id, ...doc } });
  } catch (e) {
    console.error("[tags] POST", e);
    return fail(safeMessage(e), 500);
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

    /**
     * ★組み込みのタグも受け付ける★（Issue #248）tags/{組み込みの ID} に上書き用のドキュメントを置く（無ければ作る）。
     *   隠せない組み込みのタグ（all・guest・couple・family）の archived: true は断る。guest は名前・色・コミュニティも変えない
     *   （並び順だけ）。ID は変えられない。
     */
    const id = typeof body.id === "string" ? body.id : "";
    const builtin = isBuiltinTagId(id);
    if (!builtin && !isCustomTagId(id)) return fail("そのタグは存在しません", 404);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    const editsLook = typeof body.label === "string" || typeof body.palette === "string" || typeof body.community === "boolean" || typeof body.selectable === "boolean";
    if (editsLook && !canEditTag(id)) return fail("このタグの名前・色は変えられません", 400);
    if (body.archived === true && !canHideTag(id)) return fail("このタグはアプリの動きに使っているため、隠せません", 400);
    if (typeof body.label === "string") {
      const label = body.label.trim();
      if (!label || label.length > MAX_TAG_LABEL) {
        return fail(`タグ名は1〜${MAX_TAG_LABEL}文字です`, 400);
      }
      patch.label = label;
    }
    if (typeof body.palette === "string" && PALETTES.has(body.palette)) patch.palette = body.palette;
    // 選べるかどうか（selectable）は作ったタグだけ（組み込みのタグは TAG_DEFS のまま）
    if (!builtin && typeof body.selectable === "boolean") patch.selectable = body.selectable;
    if (typeof body.community === "boolean") patch.community = body.community;
    // ★物理削除はしない★
    //   Custom Claims と episodes.visibleToTags に残った ID を壊さないため、
    //   削除は archived による論理削除（組み込みのタグは「隠す」）だけを提供する。
    if (typeof body.archived === "boolean") patch.archived = body.archived;
    if (typeof body.order === "number" && Number.isInteger(body.order) && body.order >= 0 && body.order < 1000) patch.order = body.order;

    const ref = g.db.collection("tags").doc(id);
    if (!builtin) {
      const snap = await ref.get();
      if (!snap.exists) return fail("そのタグは存在しません", 404);
    }
    // 名前を変える・戻すときは、ほかのタグ（隠していないもの）と同じ名前にしない
    const nextLabel = typeof patch.label === "string" ? patch.label : null;
    if (nextLabel !== null || body.archived === false) {
      const all = await readOrderedTags(g.db);
      const self = all.find((t) => t.id === id);
      const label = nextLabel ?? self?.label ?? "";
      if (all.some((t) => t.id !== id && !t.archived && t.label === label)) return fail(`「${label}」は既に存在します`, 400);
    }
    await ref.set(patch, { merge: true });

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("[tags] PATCH", e);
    return fail(safeMessage(e), 500);
  }
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _GET/_POST/_PATCH の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const GET = withGuard({ name: "admin.tags.list", auth: "admin", rateLimit: { key: "uid", limit: 120, windowSec: 60 } }, _GET);
export const POST = withGuard({ name: "admin.tags.create", auth: "admin", rateLimit: { key: "uid", limit: 30, windowSec: 60 }, audit: { action: "tag.create" } }, _POST);
export const PATCH = withGuard({ name: "admin.tags.update", auth: "admin", rateLimit: { key: "uid", limit: 60, windowSec: 60 }, audit: { action: "tag.update", target: (b) => b.id } }, _PATCH);
