import { applyGuestTags, readGuestClaims } from "@/lib/guests-server";
import { TAG_DEFS } from "@/config/tags";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { INVITATION_STATUSES, isPreRegisteredUid } from "@/config/roster";
import { withGuard } from "@/lib/route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATUS_IDS = new Set<string>(INVITATION_STATUSES.map((s) => s.id));
const KNOWN_TAGS = new Set(TAG_DEFS.map((t) => t.id));
const MAX_BULK = 300;
const CHUNK = 400;

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function newPreUid(): string {
  return `pre_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

type Entry = {
  displayName?: unknown; kana?: unknown; tags?: unknown; invitationStatus?: unknown;
};

/** 区分(category)は廃止。コミュニティはすべて tags で表現する */
function clean(e: Entry): {
  displayName: string; kana: string; tags: string[]; invitationStatus: string;
} | null {
  const displayName = typeof e.displayName === "string" ? e.displayName.trim() : "";
  if (!displayName || displayName.length > 40) return null;
  const kana = typeof e.kana === "string" ? e.kana.trim().slice(0, 40) : "";
  const tags = Array.isArray(e.tags)
    ? [...new Set((e.tags as unknown[]).filter(
        (t): t is string => typeof t === "string" && KNOWN_TAGS.has(t),
      ))].sort().slice(0, 20)
    : [];
  const invitationStatus =
    typeof e.invitationStatus === "string" && STATUS_IDS.has(e.invitationStatus)
      ? e.invitationStatus
      : "unsent";
  return { displayName, kana, tags, invitationStatus };
}

async function _POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[roster] 未捕捉の例外", e);
    return fail(e instanceof Error ? e.message : "サーバー内部エラー", 500);
  }
}

async function handle(req: Request) {
  const { auth, db } = admin();
  const header = req.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return fail("認証情報がありません", 401);
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    if (decoded.admin !== true) return fail("管理者権限が必要です", 403);
  } catch { return fail("ログインし直してください", 401); }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return fail("リクエストが不正です", 400); }
  const action = body.action;

  if (action === "bulk") {
    const raw = Array.isArray(body.rows) ? (body.rows as Entry[]) : [];
    if (raw.length === 0) return fail("追加する行がありません", 400);
    if (raw.length > MAX_BULK) return fail(`一度に追加できるのは ${MAX_BULK} 件までです`, 400);
    const entries = raw.map(clean).filter((e): e is NonNullable<typeof e> => e !== null);
    if (entries.length === 0) return fail("有効な行がありません", 400);

    let created = 0;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const batch = db.batch();
      for (const e of entries.slice(i, i + CHUNK)) {
        const uid = newPreUid();
        // ★氏名（displayName / kana）は guestPrivate に振り分ける★
        //   名簿の氏名欄は本名。guests はゲストが list できる領域なので置かない。
        batch.set(db.collection("guests").doc(uid), {
          uid, nickname: "", tags: e.tags, invitationStatus: e.invitationStatus,
          isPreRegistered: true, isRegistered: false, isApproved: false,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        batch.set(db.collection("guestPrivate").doc(uid), {
          uid, displayName: e.displayName, kana: e.kana,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        created += 1;
      }
      await batch.commit();
    }
    return NextResponse.json({ ok: true, created });
  }

  if (action === "upsert") {
    const entry = clean(body as Entry);
    if (!entry) return fail("名前を入力してください", 400);
    const uid = typeof body.uid === "string" && body.uid ? body.uid : newPreUid();
    const exists = (await db.collection("guests").doc(uid).get()).exists;
    const patch: Record<string, unknown> = {
      uid, invitationStatus: entry.invitationStatus, updatedAt: FieldValue.serverTimestamp(),
    };
    // ★氏名は guestPrivate へ★
    const privatePatch: Record<string, unknown> = {
      uid, displayName: entry.displayName, kana: entry.kana,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!exists) {
      patch.isPreRegistered = true; patch.isRegistered = false; patch.isApproved = false;
      patch.nickname = ""; patch.tags = entry.tags; patch.createdAt = FieldValue.serverTimestamp();
    }
    let tags: string[] | undefined;
    if (Array.isArray(body.tags)) {
      const raw = (body.tags as unknown[]).filter((t): t is string => typeof t === "string");
      const unknown = raw.filter((t) => !KNOWN_TAGS.has(t));
      if (unknown.length > 0) return fail(`未定義のタグです: ${unknown.join(", ")}`, 400);
      if (raw.length > 20) return fail("タグは20個までです", 400);

      const applied = await applyGuestTags(uid, raw);
      tags = applied.tags;
      patch.tags = applied.tags;
      if (applied.claimsUpdated) patch.claimsUpdatedAt = FieldValue.serverTimestamp();
    }
    const wb = db.batch();
    wb.set(db.collection("guests").doc(uid), patch, { merge: true });
    wb.set(db.collection("guestPrivate").doc(uid), privatePatch, { merge: true });
    await wb.commit();
    return NextResponse.json({ ok: true, uid, created: !exists, tags });
  }

  if (action === "delete") {
    const uid = typeof body.uid === "string" ? body.uid : "";
    if (!uid) return fail("uid が必要です", 400);
    if (!isPreRegisteredUid(uid)) return fail("ログイン済みのゲストは削除できません", 400);
    const linked = await db.collection("faces").where("matchedGuestId", "==", uid).limit(1).get();
    if (!linked.empty) return fail("顔が紐付いています。先に統合または紐付け解除してください", 409);
    // guestPrivate に氏名を持たせたので、同時に消さないと孤児が残る
    const db2 = db.batch();
    db2.delete(db.collection("guests").doc(uid));
    db2.delete(db.collection("guestPrivate").doc(uid));
    await db2.commit();
    return NextResponse.json({ ok: true, uid });
  }

  if (action === "merge") {
    const fromUid = typeof body.fromUid === "string" ? body.fromUid : "";
    const toUid = typeof body.toUid === "string" ? body.toUid : "";
    if (!fromUid || !toUid || fromUid === toUid) return fail("統合元と統合先が不正です", 400);
    if (!isPreRegisteredUid(fromUid)) return fail("統合元は仮ゲストのみ指定できます", 400);
    const [fromSnap, toSnap, fromPriv, toPriv] = await Promise.all([
      db.collection("guests").doc(fromUid).get(),
      db.collection("guests").doc(toUid).get(),
      db.collection("guestPrivate").doc(fromUid).get(),
      db.collection("guestPrivate").doc(toUid).get(),
    ]);
    if (!fromSnap.exists) return fail("統合元が見つかりません", 404);
    if (!toSnap.exists) return fail("統合先が見つかりません", 404);

    const faces = await db.collection("faces").where("matchedGuestId", "==", fromUid).get();
    const postIds = new Set<string>();
    for (let i = 0; i < faces.docs.length; i += CHUNK) {
      const batch = db.batch();
      for (const d of faces.docs.slice(i, i + CHUNK)) {
        batch.update(d.ref, { matchedGuestId: toUid, mergedFrom: fromUid });
        postIds.add(d.get("postId") as string);
      }
      await batch.commit();
    }

    const posts = await db.collection("posts").where("detectedUserIds", "array-contains", fromUid).get();
    for (let i = 0; i < posts.docs.length; i += CHUNK) {
      const batch = db.batch();
      for (const d of posts.docs.slice(i, i + CHUNK)) {
        const cur = (d.get("detectedUserIds") ?? []) as string[];
        const next = [...new Set(cur.filter((x) => x !== fromUid).concat(toUid))].sort();
        batch.update(d.ref, { detectedUserIds: next, updatedAt: FieldValue.serverTimestamp() });
      }
      await batch.commit();
    }

    const carry: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    carry.invitationStatus = fromSnap.get("invitationStatus") ?? "sent";

    // ★氏名の引き継ぎは guestPrivate 同士で行う★
    const carryPriv: Record<string, unknown> = { uid: toUid, updatedAt: FieldValue.serverTimestamp() };
    if (!toPriv.get("kana") && fromPriv.get("kana")) carryPriv.kana = fromPriv.get("kana");
    if (!toPriv.get("displayName") && fromPriv.get("displayName")) {
      carryPriv.displayName = fromPriv.get("displayName");
    }

    /**
     * ★仮登録時に付けたタグを Custom Claims へ引き継ぐ★
     *   pre_xxxx には Auth ユーザーが無いため、名簿作成時の applyGuestTags は
     *   auth/user-not-found で空振りし、タグは Firestore にだけ残っていた。
     *   ここで実ユーザーの Claims へ移さないと、承認時に付くのは
     *   DEFAULT_GUEST_TAGS だけになり、「親族」「新郎友人」などの
     *   コミュニティタグが永久に反映されない。
     *
     *   和集合にするのは、統合先が既に持っているタグを消さないため。
     */
    const fromTags = (fromSnap.get("tags") ?? []) as string[];
    if (Array.isArray(fromTags) && fromTags.length > 0) {
      const cur = await readGuestClaims(toUid);
      const merged = [...new Set([...cur.tags, ...fromTags])].sort();
      const applied = await applyGuestTags(toUid, merged);
      carry.tags = applied.tags;
      if (applied.claimsUpdated) {
        carry.claimsUpdatedAt = FieldValue.serverTimestamp();
      }
    }

    await db.collection("guests").doc(toUid).set(carry, { merge: true });
    await db.collection("guestPrivate").doc(toUid).set(carryPriv, { merge: true });
    await db.collection("guests").doc(fromUid).set({ mergedInto: toUid, isArchived: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    return NextResponse.json({ ok: true, fromUid, toUid, faces: faces.size, posts: posts.size });
  }
  return fail("action が不正です", 400);
}

// ---- 共通の関所（認証・メンテナンス・レートリミット・監査ログ・Sentry）----
//   _POST の中の本人確認（失効チェック付き）はそのまま残している。二重の関所になる。
export const POST = withGuard({ name: "admin.roster", auth: "admin", maxBodyBytes: 1024 * 1024, rateLimit: { key: "uid", limit: 60, windowSec: 60 }, audit: { action: (b) => `roster.${String(b.action ?? "unknown")}`, target: (b) => b.uid ?? b.fromUid } }, _POST);
