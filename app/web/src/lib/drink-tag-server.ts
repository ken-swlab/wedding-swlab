import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { applyGuestTags, readGuestClaims } from "@/lib/guests-server";
import { DRINK_LEVEL_MAX, HEAVY_DRINKER_TAG } from "@/config/drink";

/**
 * 酒豪タグ（Issue #147）。お酒で「大量」（DRINK_LEVEL_MAX）を選んだ人に付け、ほかに変えたら外す。
 *
 * ★付けるのは承認済みの人だけ★ 承認前の人は、承認のとき（/api/admin/update-guest）に反映する。
 *   承認前の Claims にタグを付けると、承認を待たずに投稿が見えてしまう（Rules の canSee）。
 * ★Claims は applyGuestTags() で変える★（マージ → 900 バイト以下 → タグを外すときだけ revokeRefreshTokens）。
 *   guests.tags と claimsUpdatedAt も一緒に書き、本人の画面にタグの変更を届ける。
 */

export function wantsHeavyDrinkerTag(drinkLevel: unknown): boolean {
  return drinkLevel === DRINK_LEVEL_MAX;
}

/** タグ「酒豪」が無ければ作る。名前・色・選べるかは、あとから管理画面で変えられる（作るときだけ既定値を入れる） */
export async function ensureHeavyDrinkerTag(db: Firestore): Promise<void> {
  const ref = db.collection("tags").doc(HEAVY_DRINKER_TAG.id);
  if ((await ref.get()).exists) return;
  try {
    await ref.create({
      label: HEAVY_DRINKER_TAG.label,
      palette: HEAVY_DRINKER_TAG.palette,
      // 既定は投稿の公開範囲で選べる。コミュニティ扱いはしない（人物検索の範囲を広げない）
      selectable: true,
      community: false,
      archived: false,
      order: 1000,
      createdAt: Date.now(),
      createdBy: "system",
    });
  } catch (e) {
    // 同時に作られたときは既にある（create は既存 ID で失敗する）
    if (!(await ref.get()).exists) throw e;
  }
}

/** 承認時のタグの一覧に、必要なら酒豪タグを足す（update-guest から呼ぶ） */
export async function withHeavyDrinkerTag(db: Firestore, uid: string, tags: string[]): Promise<string[]> {
  const snap = await db.collection("guestPrivate").doc(uid).get();
  if (!wantsHeavyDrinkerTag(snap.get("drinkLevel"))) return tags;
  await ensureHeavyDrinkerTag(db);
  return [...new Set([...tags, HEAVY_DRINKER_TAG.id])].sort();
}

/**
 * 回答を保存したあと、承認済みの人の酒豪タグを付け外しする。
 * ★変わるときだけ Claims を書く★ タグを外すとき（「大量」から下げたとき）は applyGuestTags が
 *   リフレッシュトークンを失効させ、ログインし直すまで API が 401 になるので、回答を保存するたびに呼ばない。
 *   付けるときは失効させない（Issue #156）。
 */
export async function syncHeavyDrinkerTag(uid: string, drinkLevel: unknown): Promise<void> {
  const { db } = admin();
  const publicRef = db.collection("guests").doc(uid);
  const publicSnap = await publicRef.get();
  if (publicSnap.get("isApproved") !== true) return;

  const current = await readGuestClaims(uid);
  const want = wantsHeavyDrinkerTag(drinkLevel);
  const has = current.tags.includes(HEAVY_DRINKER_TAG.id);
  if (want === has) return;

  if (want) await ensureHeavyDrinkerTag(db);
  const next = want ? [...current.tags, HEAVY_DRINKER_TAG.id] : current.tags.filter((t) => t !== HEAVY_DRINKER_TAG.id);
  const applied = await applyGuestTags(uid, next);
  const patch: Record<string, unknown> = { tags: applied.tags, updatedAt: FieldValue.serverTimestamp() };
  if (applied.claimsUpdated) patch.claimsUpdatedAt = FieldValue.serverTimestamp();
  await publicRef.set(patch, { merge: true });
}
