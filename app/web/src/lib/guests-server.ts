import "server-only";
import { admin } from "@/lib/firebase-admin";
import { PublicError } from "@/lib/public-error";

const CLAIMS_BYTE_LIMIT = 900;
export type GuestClaims = { tags: string[]; isAdmin: boolean; hasAuthUser: boolean; };
function isNotFound(e: unknown): boolean { return (e as { code?: string }).code === "auth/user-not-found"; }

export async function readGuestClaims(uid: string): Promise<GuestClaims> {
  const { auth, db } = admin();
  try {
    const user = await auth.getUser(uid);
    const prev = user.customClaims ?? {};
    return { tags: Array.isArray(prev.tags) ? (prev.tags as string[]) : [], isAdmin: prev.admin === true, hasAuthUser: true };
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }
  const snap = await db.collection("guests").doc(uid).get();
  const t = snap.get("tags");
  return { tags: Array.isArray(t) ? (t as string[]) : [], isAdmin: false, hasAuthUser: false };
}

export async function applyGuestTags(
  uid: string,
  tags: string[],
  opts: { forceRevoke?: boolean } = {},
): Promise<{ tags: string[]; claimsUpdated: boolean }> {
  const { auth } = admin();
  const sorted = Array.from(new Set(tags)).sort();
  try {
    const user = await auth.getUser(uid);
    const prev = user.customClaims ?? {};
    const prevTags = Array.isArray(prev.tags) ? (prev.tags as string[]) : [];
    const next = { ...prev, tags: sorted };
    if (Buffer.byteLength(JSON.stringify(next), "utf8") > CLAIMS_BYTE_LIMIT) throw new PublicError("Custom Claims が上限に達しました（タグを減らしてください）");
    await auth.setCustomUserClaims(uid, next);

    /**
     * ★タグを外すとき（とアクセス停止）は、クレーム変更を即座に効かせる★
     *   setCustomUserClaims はリフレッシュトークンを失効させない。
     *   verifyIdToken(token, true) の checkRevoked が見るのは
     *   tokensValidAfterTime と disabled だけで、クレームの鮮度は見ない。
     *   これが無いと、タグや admin を剥奪しても手持ちの ID トークンが
     *   切れるまで（最大1時間）旧権限で操作を続けられる。
     *   披露宴当日に「荒らしを即座に止める」運用が成立しなくなる。
     *
     * ★タグを足すだけなら失効させない★（Issue #156）
     *   失効のチェックはトークンの auth_time（最初にログインした時刻）と比べるので、
     *   失効させると getIdToken(true) で取り直しても、ログインし直すまで API がすべて 401 になる
     *   （承認のあと自動で先へ進めず、承認後の演出 #150 も出ない）。
     *   足すだけなら古いトークンは権限が少ない側なので、残しても安全上の問題はない。
     *   新しいタグは、クライアントが claimsUpdatedAt を見て取り直したときに乗る。
     */
    const removed = prevTags.some((t) => !sorted.includes(t));
    if (removed || opts.forceRevoke) {
      try {
        await auth.revokeRefreshTokens(uid);
      } catch (e) {
        console.error(`[guests] revokeRefreshTokens 失敗 uid=${uid}`, e);
      }
    }
    return { tags: sorted, claimsUpdated: true };
  } catch (e) {
    if (!isNotFound(e)) throw e;
    return { tags: sorted, claimsUpdated: false };
  }
}
