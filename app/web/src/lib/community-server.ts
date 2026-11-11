import "server-only";
import type { Timestamp } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { memo } from "@/lib/server-memo";
import { rankEntries } from "@/lib/reaction-ranking";
import type { CommunityGroup, GroupEntry, GroupMember } from "@/lib/community-view";
import { COMMUNITY_CACHE_TTL_SEC, COMMUNITY_GUEST_LIMIT } from "@/config/community";
import { REACTION_MAX_MS, REACTION_MIN_MS } from "@/config/opening";

/** 保存済みのタイムとして信用できる形か（壊れた値を並べない） */
export function validReactionMs(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= REACTION_MIN_MS && v <= REACTION_MAX_MS;
}

/**
 * タグごとの集計（仲間の一覧とランキングの全員分）。★タグごとに COMMUNITY_CACHE_TTL_SEC だけ使い回す★（Issue #286）
 *
 * ★アクセス権の確認は、ここを呼ぶ前に毎回、呼び出し側（/api/guest/community）で行う★
 * ★全員に共通の部分だけ★ 自分の行・「全員」の伏せ方は、呼び出し側（lib/community-view.ts）で毎回作る。
 * ★uid を含むので、そのまま返さない★
 *
 * 対象は、そのタグを持つ承認済み・登録済みのゲスト（仮登録・統合済み・停止は除く）。今までの2つの API（仲間・ランキング）と同じ。
 *   仲間 … 出欠が「欠席」以外（親族用の欠席も除く）。ニックネーム・アイコン・2次会のみか。
 *   ランキング … 記録がある人（reactionTimes）。
 * ゲストの一覧は1回だけ読み、guestPrivate と reactionTimes は同時に読む（今までは API ごとに一覧を読んでいた）。
 */
export function loadCommunityGroup(tag: string): Promise<CommunityGroup> {
  return memo(`community:${tag}`, COMMUNITY_CACHE_TTL_SEC * 1000, async () => {
    const { db } = admin();
    const guests = await db.collection("guests").where("tags", "array-contains", tag).limit(COMMUNITY_GUEST_LIMIT).get();
    const candidates = guests.docs.filter(
      (d) => d.get("isApproved") === true && d.get("isRegistered") === true && d.get("isArchived") !== true && !d.get("mergedInto"),
    );
    const [privates, times] =
      candidates.length > 0
        ? await Promise.all([
            db.getAll(...candidates.map((d) => db.collection("guestPrivate").doc(d.id))),
            db.getAll(...candidates.map((d) => db.collection("reactionTimes").doc(d.id))),
          ])
        : [[], []];
    // ★使い回しが効いているかを、ログで確かめられるようにする★（読んだ件数だけ。名前・uid は出さない）
    console.info(`[community] タグの集計を読み直しました（ゲスト ${candidates.length} 件）`);

    const members: GroupMember[] = [];
    const entries: GroupEntry[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const g = candidates[i];
      const nicknameRaw: unknown = g.get("nickname");
      const photoRaw: unknown = g.get("photoURL");
      const nickname = typeof nicknameRaw === "string" && nicknameRaw.trim() ? nicknameRaw.trim() : "ゲスト";
      const photoURL = typeof photoRaw === "string" ? photoRaw : "";

      const attendance: unknown = privates[i].get("attendance");
      // ★親族用の欠席（familyAttendance）も除く★（Issue #240）。停止の印も念のため除く
      const away = attendance === "declined" || privates[i].get("familyAttendance") === "declined" || privates[i].get("isActive") === false;
      if (!away) members.push({ nickname, photoURL, secondOnly: attendance === "second_only" });

      const ms: unknown = times[i].get("reactionMs");
      if (validReactionMs(ms)) {
        const at = times[i].get("recordedAt") as Timestamp | undefined;
        entries.push({ uid: g.id, reactionMs: ms, recordedAtMs: at?.toMillis?.() ?? 0, nickname, photoURL });
      }
    }
    members.sort((a, b) => Number(a.secondOnly) - Number(b.secondOnly) || a.nickname.localeCompare(b.nickname, "ja"));
    return { members, ranked: rankEntries(entries) };
  });
}
