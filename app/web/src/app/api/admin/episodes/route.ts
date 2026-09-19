import { NextResponse } from "next/server";
import type { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { TAG_DEFS } from "@/config/tags";
import { EPISODE_THEMES, MAX_EPISODE_CONTENT, MAX_EPISODE_PERIOD, MAX_EPISODE_TARGETS, MAX_EPISODE_TITLE } from "@/config/episodes";
import type { Episode, EpisodeStatus } from "@/types/episode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KNOWN_TAGS = new Set(TAG_DEFS.map((t) => t.id));
const KNOWN_THEMES = new Set<string>(EPISODE_THEMES.map((t) => t.id));
const STATUSES = new Set<string>(["pending", "approved", "rejected"]);
const MAX_LIST = 500;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/** 管理者かを確認する。通れば uid、通らなければレスポンスを返す */
async function requireAdmin(req: Request): Promise<string | NextResponse> {
  const { auth } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);

  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    if (decoded.admin !== true) return fail("管理者権限が必要です", 403);
    return decoded.uid;
  } catch {
    return fail("ログインし直してください", 401);
  }
}

function toEpisode(d: QueryDocumentSnapshot<DocumentData>): Episode {
  const v = d.data();
  return {
    id: d.id,
    status: (v.status ?? "pending") as EpisodeStatus,
    authorUid: v.authorUid ?? "",
    authorName: v.authorName ?? "ゲスト",
    theme: v.theme ?? "other",
    originalText: v.originalText ?? "",
    photoUrls: Array.isArray(v.photoUrls) ? v.photoUrls : [],
    createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
    title: v.title ?? "",
    period: v.period ?? "",
    content: v.content ?? "",
    targetTags: Array.isArray(v.targetTags) ? v.targetTags : [],
    targetUids: Array.isArray(v.targetUids) ? v.targetUids : [],
    visibleToTags: Array.isArray(v.visibleToTags) ? v.visibleToTags : [],
    updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : undefined,
    reviewedBy: v.reviewedBy ?? undefined,
  };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function cleanTags(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const list = v.filter((t): t is string => typeof t === "string");
  if (list.length > MAX_EPISODE_TARGETS) return null;
  if (list.some((t) => !KNOWN_TAGS.has(t))) return null;
  return [...new Set(list)].sort();
}

/** 実在するゲストかを1回のまとめ読みで確認する */
async function cleanUids(v: unknown): Promise<string[] | null> {
  if (!Array.isArray(v)) return null;
  const list = [...new Set(v.filter((u): u is string => typeof u === "string" && u.length <= 128))];
  if (list.length > MAX_EPISODE_TARGETS) return null;
  if (list.length === 0) return [];

  const { db } = admin();
  const snaps = await db.getAll(...list.map((u) => db.collection("guests").doc(u)));
  if (snaps.some((s) => !s.exists)) return null;
  return list.sort();
}

// =====================================================================
// GET : 一覧
// =====================================================================
export async function GET(req: Request) {
  try {
    const guard = await requireAdmin(req);
    if (guard instanceof NextResponse) return guard;

    const { db } = admin();
    const status = new URL(req.url).searchParams.get("status") ?? "all";

    // ★orderBy を付けない★
    //   status との複合インデックス作成を待たずに動かすため。
    //   披露宴の規模（数百件）なら JS 側の並べ替えで十分。
    const base = db.collection("episodes");
    const snap = await (
      status !== "all" && STATUSES.has(status)
        ? base.where("status", "==", status)
        : base
    ).limit(MAX_LIST).get();

    const episodes = snap.docs
      .map(toEpisode)
      .sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ ok: true, episodes });
  } catch (e) {
    console.error("[episodes GET]", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}

// =====================================================================
// POST : 新規作成（テスト投稿 / 新郎新婦が自分で書く用）
// =====================================================================
export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req);
    if (guard instanceof NextResponse) return guard;

    const { db } = admin();
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return fail("リクエストが不正です", 400);
    }

    const authorUid = str(body.authorUid);
    if (!authorUid) return fail("authorUid が必要です", 400);

    const guest = await db.collection("guests").doc(authorUid).get();
    if (!guest.exists) return fail("投稿者が名簿にいません", 404);

    const theme = str(body.theme);
    if (!KNOWN_THEMES.has(theme)) return fail("お題が不正です", 400);

    const originalText = str(body.originalText);
    if (!originalText || originalText.length > MAX_EPISODE_CONTENT) {
      return fail(`本文は1〜${MAX_EPISODE_CONTENT}文字で入力してください`, 400);
    }

    const photoUrls = Array.isArray(body.photoUrls)
      ? (body.photoUrls as unknown[]).filter((u): u is string => typeof u === "string").slice(0, 4)
      : [];

    const status = STATUSES.has(str(body.status)) ? (str(body.status) as EpisodeStatus) : "pending";
    const now = Date.now();

    const ref = await db.collection("episodes").add({
      status,
      authorUid,
      authorName: guest.get("nickname") || guest.get("displayName") || "ゲスト",
      theme,
      originalText,
      photoUrls,
      createdAt: now,
      // 管理者が整える欄は空で作る
      title: str(body.title),
      period: str(body.period),
      content: str(body.content) || originalText,
      targetTags: [],
      targetUids: [],
      // 既定は全体公開。限定したい場合は承認時に絞る。
      visibleToTags: ["all"],
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    console.error("[episodes POST]", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}

// =====================================================================
// PUT : 承認・編集
// =====================================================================
export async function PUT(req: Request) {
  try {
    const guard = await requireAdmin(req);
    if (guard instanceof NextResponse) return guard;
    const actor = guard;

    const { db } = admin();
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return fail("リクエストが不正です", 400);
    }

    const id = str(body.id);
    if (!id) return fail("id が必要です", 400);

    const ref = db.collection("episodes").doc(id);
    if (!(await ref.get()).exists) return fail("エピソードが見つかりません", 404);

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
      reviewedBy: actor,
    };

    if (body.status !== undefined) {
      const s = str(body.status);
      if (!STATUSES.has(s)) return fail("status が不正です", 400);
      patch.status = s;
    }
    if (body.title !== undefined) {
      const t = str(body.title);
      if (t.length > MAX_EPISODE_TITLE) return fail(`タイトルは${MAX_EPISODE_TITLE}文字までです`, 400);
      patch.title = t;
    }
    if (body.period !== undefined) {
      const p = str(body.period);
      if (p.length > MAX_EPISODE_PERIOD) return fail(`時期は${MAX_EPISODE_PERIOD}文字までです`, 400);
      patch.period = p;
    }
    if (body.content !== undefined) {
      const c = str(body.content);
      if (c.length > MAX_EPISODE_CONTENT) return fail(`本文は${MAX_EPISODE_CONTENT}文字までです`, 400);
      patch.content = c;
    }
    if (body.targetTags !== undefined) {
      const t = cleanTags(body.targetTags);
      if (t === null) return fail("紐付けタグが不正です", 400);
      patch.targetTags = t;
    }
    if (body.visibleToTags !== undefined) {
      const t = cleanTags(body.visibleToTags);
      if (t === null) return fail("公開範囲タグが不正です", 400);
      // ★承認するなら公開範囲は必ず1つ以上★ 空だと誰にも届かない
      if (t.length === 0 && (patch.status ?? "") === "approved") {
        return fail("公開範囲を1つ以上選んでください", 400);
      }
      patch.visibleToTags = t;
    }
    if (body.targetUids !== undefined) {
      const u = await cleanUids(body.targetUids);
      if (u === null) return fail("紐付けゲストが不正です", 400);
      patch.targetUids = u;
    }

    await ref.set(patch, { merge: true });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("[episodes PUT]", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}
