import "server-only";
import { admin } from "@/lib/firebase-admin";
import { parseInvitationConfig } from "@/lib/invitation-config";
import type { InvitationConfig } from "@/types/invitation";

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
 */
const TTL_MS = 60_000;
let cached: { at: number; value: InvitationConfig | null } | null = null;

export async function invitationConfig(now: number = Date.now()): Promise<InvitationConfig | null> {
  if (cached && now - cached.at < TTL_MS) return cached.value;

  let value = cached?.value ?? null;
  try {
    const snap = await admin().db.collection("config").doc("invitation").get();
    if (!snap.exists) {
      console.error("[invitation] config/invitation が未設定です（scripts/ops.mjs invitation set で入れてください）");
      value = null;
    } else {
      const parsed = parseInvitationConfig(snap.data());
      if (parsed.ok) value = parsed.value;
      else {
        console.error(`[invitation] config/invitation の形が違います（項目: ${parsed.field}）`);
        value = null;
      }
    }
  } catch (e) {
    console.error("[invitation] 読み込みに失敗しました（直前の値を使います）", e);
  }
  cached = { at: now, value };
  return value;
}
