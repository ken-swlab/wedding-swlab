import { NextResponse } from "next/server";
import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { withGuard } from "@/lib/route-guard";
import { safeMessage } from "@/lib/public-error";
import { knownTagIds, migrateTagOrder } from "@/lib/tags-server";
import { parseWelcomeConfig, type WelcomeConfig } from "@/lib/welcome-config";
import { COUPLE_TAG } from "@/config/tags";
import { WELCOME_ADMIN_COUPLE_LIMIT, WELCOME_ADMIN_POSTS_PER_AUTHOR } from "@/config/welcome";
import type { AdminWelcomeStatus, WelcomePostOption } from "@/types/welcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 一覧に出す本文の長さ */
const TEXT_PREVIEW = 40;

const EMPTY: WelcomeConfig = { defaultPostId: "", byTag: {}, message: "", messages: {} };

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

/** 本人確認（失効チェック付き）と管理者の確認。だめなら応答を返す */
async function guard(req: Request): Promise<NextResponse | null> {
  const { auth } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    if (decoded.admin !== true) return fail("管理者権限が必要です", 403);
    return null;
  } catch {
    return fail("ログインし直してください", 401);
  }
}

/** 投稿を一覧の形にする。写真（1枚目）が無ければ null */
function toOption(snap: DocumentSnapshot, couple: boolean): WelcomePostOption | null {
  if (!snap.exists) return null;
  const media = snap.get("media");
  const image = Array.isArray(media) ? media.find((m) => m && m.type === "image") : null;
  if (!image) return null;
  const visibleTo = snap.get("visibleToTags");
  const text = snap.get("text");
  const createdAt = snap.get("createdAt");
  return {
    id: snap.id,
    media: { storagePath: typeof image.storagePath === "string" ? image.storagePath : "", url: typeof image.url === "string" ? image.url : "" },
    text: typeof text === "string" ? text.slice(0, TEXT_PREVIEW) : "",
    visibleToTags: Array.isArray(visibleTo) ? visibleTo.filter((t): t is string => typeof t === "string") : [],
    status: snap.get("status") === "hidden" ? "hidden" : "visible",
    createdAt: createdAt && typeof createdAt.toMillis === "function" ? createdAt.toMillis() : 0,
    couple,
  };
}

/** 設定に入っている投稿 ID（重複なし） */
function referencedPostIds(c: WelcomeConfig): string[] {
  return [...new Set([c.defaultPostId, ...Object.values(c.byTag)].filter(Boolean))];
}

async function getPosts(db: Firestore, ids: string[]): Promise<DocumentSnapshot[]> {
  if (ids.length === 0) return [];
  return db.getAll(...ids.map((id) => db.collection("posts").doc(id)));
}

/**
 * GET: 今の設定と、選べる写真（新郎新婦の投稿）の一覧（Issue #215）。
 * ★新郎新婦は guests の tags に couple がある人★ 投稿は posts(authorUid ASC, createdAt DESC) の複合インデックスで読む
 *   （マイページ・webhook と同じ形。新しいインデックスは要らない）。
 */
async function _GET(req: Request) {
  try {
    const denied = await guard(req);
    if (denied) return denied;
    const { db } = admin();

    const snap = await db.collection("config").doc("welcome").get();
    let config = EMPTY;
    let broken: string | null = null;
    if (snap.exists) {
      const parsed = parseWelcomeConfig(snap.data());
      if (parsed.ok) config = parsed.value;
      else {
        broken = parsed.field;
        console.error(`[admin/welcome] config/welcome の形が違います（項目: ${parsed.field}）`);
      }
    }

    const couples = await db.collection("guests").where("tags", "array-contains", COUPLE_TAG).limit(WELCOME_ADMIN_COUPLE_LIMIT).get();
    const lists = await Promise.all(
      couples.docs.map((g) =>
        db.collection("posts").where("authorUid", "==", g.id).orderBy("createdAt", "desc").limit(WELCOME_ADMIN_POSTS_PER_AUTHOR).get(),
      ),
    );
    const posts = new Map<string, WelcomePostOption>();
    for (const list of lists) {
      for (const d of list.docs) {
        const o = toOption(d, true);
        if (o) posts.set(o.id, o);
      }
    }

    // 設定に入っているのに一覧に無い投稿（新郎新婦以外の投稿・古い投稿）も、サムネイルを出すために読む
    const extraIds = referencedPostIds(config).filter((id) => !posts.has(id));
    const missing: string[] = [];
    for (const d of await getPosts(db, extraIds)) {
      const o = toOption(d, false);
      if (o) posts.set(o.id, o);
      else missing.push(d.id);
    }

    const res: AdminWelcomeStatus = {
      config,
      broken,
      posts: [...posts.values()].sort((a, b) => b.createdAt - a.createdAt),
      missing,
    };
    return NextResponse.json({ ok: true, ...res }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[admin/welcome] GET 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

/**
 * PUT: 設定をまとめて保存する（Issue #215）。本文は config/welcome の形そのまま（lib/welcome-config.ts）。
 * ★だめなときは項目の名前だけ返す★ 値は応答にもログにも出さない。
 * ★投稿は実在し、写真があるものだけ★ 見えない投稿（公開範囲の外・非表示）は保存できる（画面が警告を出す。
 *   ゲストには /api/guest/welcome が仮の画像を出す）。
 */
async function _PUT(req: Request) {
  try {
    const denied = await guard(req);
    if (denied) return denied;
    const { db } = admin();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("リクエストが不正です", 400);
    }
    const parsed = parseWelcomeConfig(body);
    if (!parsed.ok) return fail(`設定の形が違います（項目: ${parsed.field}）`, 400);
    const config = parsed.value;

    const known = await knownTagIds(db);
    for (const [field, ids] of [
      ["byTag", Object.keys(config.byTag)],
      ["messages", Object.keys(config.messages)],
    ] as const) {
      if (ids.some((t) => !known.has(t))) return fail(`未定義のタグがあります（項目: ${field}）`, 400);
    }

    const snaps = await getPosts(db, referencedPostIds(config));
    if (snaps.some((d) => !toOption(d, false))) return fail("見つからない投稿か、写真のない投稿が選ばれています", 400);

    // ★置き換える前に、以前の優先順（priority）をタグの並び順へ移す★（Issue #248。移し済みなら何もしない）
    //   丸ごと置き換えると priority が消えるので、先に移しておく。
    await migrateTagOrder(db);
    // ★丸ごと置き換える★ 画面は GET で受け取った設定を全部送り返す（画面に出ないタグの設定も消さない）。priority は書かない
    await db.collection("config").doc("welcome").set(config);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/welcome] PUT 未捕捉の例外", e);
    return fail(safeMessage(e), 500);
  }
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   ハンドラの中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const GET = withGuard({ name: "admin.welcome.get", auth: "admin", rateLimit: { key: "uid", limit: 60, windowSec: 60 } }, _GET);
export const PUT = withGuard(
  { name: "admin.welcome.update", auth: "admin", rateLimit: { key: "uid", limit: 20, windowSec: 60 }, audit: { action: "welcome.update", target: () => "config/welcome" } },
  _PUT,
);
