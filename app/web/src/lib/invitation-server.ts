import "server-only";
import { admin } from "@/lib/firebase-admin";
import { parseInvitationConfig } from "@/lib/invitation-config";
import type { InvitationConfig } from "@/types/invitation";
import type { InvitationKind } from "@/types/admin";

/**
 * 招待状とオープニングに出す本物の情報（Issue #131）。
 *
 * ★置き場所は Firestore の config/invitation だけ★
 *   リポジトリは公開なので、名前・日付・会場・住所をコードに書かない（src/config/wedding.ts の★参照）。
 *   クライアントは config/* を読めない（Rules の既定の拒否。infra/firestore/test に DENY のテストがある）。
 *   値を入れるのは `node scripts/ops.mjs invitation set <JSON ファイル>`。
 *
 * ★未設定・形が違うときは null を返す★ 架空の名前で招待状を出さない。画面は「準備中」を出す。
 *   形の確認は lib/invitation-config.ts（値を入れる scripts/ops.mjs と同じもの）。
 * ★60秒キャッシュ★ 招待状を開くたびに読むと読み取りが増える。値はほとんど変わらない。
 * ★読めなかったら直前の値を使う★ Firestore の一時障害で招待状が「準備中」に変わらないようにする。
 * ★値をログに出さない★ 形が違うときも、どの項目かだけを出す。
 * ★親族用は config/invitation_family（Issue #240）★ 形は同じで、同じ parseInvitationConfig で確かめる。
 *   未設定なら null（友人用の中身で代わりに出さない。親族に友人用の時刻・会場を見せないため）。
 *   値を入れるのは `node scripts/ops.mjs invitation set --family <JSON ファイル>`。
 */
const TTL_MS = 60_000;
const DOC_ID: Record<InvitationKind, string> = { friend: "invitation", family: "invitation_family" };
const cached: Partial<Record<InvitationKind, { at: number; value: InvitationConfig | null }>> = {};

export async function invitationConfig(kind: InvitationKind = "friend", now: number = Date.now()): Promise<InvitationConfig | null> {
  const hit = cached[kind];
  if (hit && now - hit.at < TTL_MS) return hit.value;

  const docId = DOC_ID[kind];
  let value = hit?.value ?? null;
  try {
    const snap = await admin().db.collection("config").doc(docId).get();
    if (!snap.exists) {
      console.error(`[invitation] config/${docId} が未設定です（scripts/ops.mjs invitation set${kind === "family" ? " --family" : ""} で入れてください）`);
      value = null;
    } else {
      const parsed = parseInvitationConfig(snap.data());
      if (parsed.ok) value = parsed.value;
      else {
        console.error(`[invitation] config/${docId} の形が違います（項目: ${parsed.field}）`);
        value = null;
      }
    }
  } catch (e) {
    console.error(`[invitation] config/${docId} の読み込みに失敗しました（直前の値を使います）`, e);
  }
  cached[kind] = { at: now, value };
  return value;
}
