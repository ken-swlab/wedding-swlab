import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { usingEmulator } from "@/lib/emulator";
import { deletePublicObjects, ownsKey, publicUrlOf, type PublicObject } from "@/lib/r2-server";
import { deleteIndexedFace } from "@/lib/rekognition";
import { DELETED_MEDIA_COLLECTION, REFERENCE_SCAN_LIMIT } from "@/config/media-delete";
import type { MediaItem } from "@/types";

/**
 * 投稿を消した・写真を外したときに、公開バケットの写真と Rekognition の顔を消す（Issue #122）。
 *
 * ★消すのは公開バケット（軽量版 t/ と高画質版 o/ の複製）と、Rekognition の顔だけ★
 *   非公開バケットの原本と Worker のマーカーは消さない（CLAUDE.md ルール 18。原本は Issue #159）。
 *
 * ★Worker との競合: 「削除の印」を先に置き、そのあとで消す★
 *   Worker（2分ごと）は、原本を公開バケットへ複製してから webhook を呼ぶ。投稿の削除がその間に入ると、
 *   こちらが消したあとに複製が置き直され、webhook は投稿を見つけられず（202）、複製が残り続ける。
 *   そこで、高画質版のキーごとに deletedMedia/{キーのハッシュ} を置いてから消す。
 *   webhook（/api/hooks/original-published）はこの印を見て、置き直された複製を消し、200 を返す
 *   （Worker は _linked/ を付けて処理を終える。Worker の変更は要らない）。
 *   印を消してからでは、競合の窓が残る。順番を入れ替えないこと。
 */

/** 印の文書 ID。キーには uid が入るので、そのまま ID にせずハッシュにする */
function markerId(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** 投稿の削除で消された高画質版のキーか（webhook から呼ぶ） */
export async function isDeletedOriginal(key: string): Promise<boolean> {
  const snap = await admin().db.collection(DELETED_MEDIA_COLLECTION).doc(markerId(key)).get();
  return snap.exists;
}

/** media の要素から、公開バケットで消す候補を作る。キーの形は deletePublicObjects がもう一度確かめる */
function publicObjectsOf(media: MediaItem[]): PublicObject[] {
  const out: PublicObject[] = [];
  for (const m of media) {
    if (typeof m?.storagePath === "string" && m.storagePath) out.push({ key: m.storagePath, kind: "thumb" });
    if (typeof m?.originalPath === "string" && m.originalPath) out.push({ key: m.originalPath, kind: "original" });
  }
  return out;
}

/**
 * まだ使われているキーを除く。
 * ★同じキーを2か所から参照できる★ API を直接呼べば、自分の別の投稿やアイコン（iconKey）に同じキーを指定できる。
 *   消すと、残しているほうの写真まで壊れる。本人の投稿（新しい順に REFERENCE_SCAN_LIMIT 件）とアイコンを見て、
 *   参照が残っているキーは消さない。
 */
async function stillReferenced(uid: string, exceptPostId: string | null): Promise<Set<string>> {
  const { db } = admin();
  const used = new Set<string>();
  const [posts, guest] = await Promise.all([
    db.collection("posts").where("authorUid", "==", uid).orderBy("createdAt", "desc").limit(REFERENCE_SCAN_LIMIT).get(),
    db.collection("guests").doc(uid).get(),
  ]);
  for (const d of posts.docs) {
    if (d.id === exceptPostId) continue;
    const media = d.get("media");
    if (!Array.isArray(media)) continue;
    for (const o of publicObjectsOf(media as MediaItem[])) used.add(o.key);
  }
  const photo = guest.get("photoURL");
  if (typeof photo === "string" && photo) used.add(photo);
  return used;
}

export type MediaCleanup = {
  /** 公開バケットで消したオブジェクトの数（まだ公開されていない高画質版も、消す操作をした数に入る） */
  deleted: number;
  /** 消せなかった数（ログに残す） */
  failed: number;
  /** 参照が残っていて、消さなかった数 */
  kept: number;
  /** Rekognition から消した顔の数 */
  faces: number;
};

/**
 * 外した・消した写真の公開側を片づける。失敗しても投げない（投稿の削除・編集は成立させる）。
 *
 * @param uid           投稿者（キーの持ち主）
 * @param postId        ログに出す投稿 ID（キーは uid を含むのでログに出さず、投稿 ID と並びの位置で示す）
 * @param removed       外した・消した media の要素（Firestore に保存されていた値）
 * @param awsFaceIds    Rekognition から消す顔の ID（その写真の faces の awsFaceId）
 * @param keepPostId    参照を数えるときに除く投稿（消した投稿）。編集のときは null（編集後の投稿の参照も数える）
 * @param logLabel      ログの見出し（例: "posts/delete"）
 */
export async function cleanupRemovedMedia(params: {
  uid: string;
  postId: string;
  removed: MediaItem[];
  awsFaceIds: string[];
  keepPostId: string | null;
  logLabel: string;
}): Promise<MediaCleanup> {
  const { uid, postId, removed, awsFaceIds, keepPostId, logLabel } = params;
  const result: MediaCleanup = { deleted: 0, failed: 0, kept: 0, faces: 0 };

  // ★エミュレーターでは何もしない★（Issue #83）。投稿の削除・編集のルートは external にしていない
  //   （画面の確認で削除と編集は動かしたい）ので、ここで止める。止めないと .env.local の本物の資格情報で
  //   本番の R2・Rekognition を呼ぶ
  if (usingEmulator) return result;

  // 1. Rekognition の顔。写真が残っていても、投稿から外れた顔は照合の候補に残さない
  for (const id of new Set(awsFaceIds.filter((v) => typeof v === "string" && v))) {
    try {
      await deleteIndexedFace(id);
      result.faces += 1;
    } catch (e) {
      console.error(`[${logLabel}] Rekognition の顔を消せませんでした`, e);
    }
  }

  // 2. 公開バケット
  let candidates = publicObjectsOf(removed).filter((o) => ownsKey(uid, o.key, o.kind));
  if (candidates.length === 0) return result;
  try {
    const used = await stillReferenced(uid, keepPostId);
    const before = candidates.length;
    candidates = candidates.filter((o) => !used.has(o.key) && !used.has(publicUrlOf(o.key)));
    result.kept = before - candidates.length;
  } catch (e) {
    // 参照を確かめられないときは消さない（他の写真を壊すより、残るほうがまし）
    console.error(`[${logLabel}] 参照の確認に失敗したので、公開バケットの写真を消しませんでした`, e);
    result.failed = candidates.length;
    return result;
  }
  if (candidates.length === 0) return result;

  // 3. 高画質版の「削除の印」を、消すより先に置く（上の★）
  const originals = candidates.filter((o) => o.kind === "original");
  if (originals.length > 0) {
    try {
      const { db } = admin();
      const batch = db.batch();
      for (const o of originals) {
        batch.set(db.collection(DELETED_MEDIA_COLLECTION).doc(markerId(o.key)), { at: FieldValue.serverTimestamp() });
      }
      await batch.commit();
    } catch (e) {
      // 印が無いまま消すと、処理中の Worker が置き直した複製が残りうる。それでも、いまある複製は消す
      console.error(`[${logLabel}] 削除の印を書けませんでした`, e);
    }
  }

  const r = await deletePublicObjects(uid, candidates);
  result.deleted = r.deleted;
  result.failed += r.failed.length + r.refused;
  if (r.failed.length > 0) {
    // ★キーは Sentry に出さない（uid が入る）★ 投稿 ID と、media の何番めの軽量版（t）・高画質版（o）かで示す。
    //   キーそのものは、削除前の投稿（Firestore のバックアップ）か、編集なら今の投稿の履歴から引ける
    const where = r.failed.map((key) => {
      const i = removed.findIndex((m) => m.storagePath === key || m.originalPath === key);
      return `${i}${removed[i]?.storagePath === key ? "t" : "o"}`;
    });
    console.error(`[${logLabel}] 公開バケットに消せなかった写真があります postId=${postId} 位置=${where.join(",")}`);
  }
  return result;
}
