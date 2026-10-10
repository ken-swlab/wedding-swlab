import {
  addDoc, collection, doc, increment, runTransaction,
  serverTimestamp, type DocumentData, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { extractTags } from "@/lib/text";
import type { MentionPerson } from "@/lib/mentions";
import { MAX_MENTIONS } from "@/config/mentions";
import type { MediaItem, Post } from "@/types";

/** snapshot -> Post。欠損フィールドをここで吸収する。 */
export function toPost(snap: QueryDocumentSnapshot<DocumentData>): Post {
  const d = snap.data();
  return {
    id: snap.id,
    authorUid: d.authorUid,
    authorName: d.authorName ?? "ゲスト",
    authorPhotoURL: d.authorPhotoURL,
    text: d.text ?? "",
    media: Array.isArray(d.media) ? d.media : [],
    visibleToTags: Array.isArray(d.visibleToTags) ? d.visibleToTags : [],
    hashtags: Array.isArray(d.hashtags) ? d.hashtags : [],
    mentions: Array.isArray(d.mentions) ? d.mentions : [],
    mentionUids: Array.isArray(d.mentionUids) ? d.mentionUids : [],
    status: d.status ?? "visible",
    reactionCount: d.reactionCount ?? 0,
    commentCount: d.commentCount ?? 0,
    // serverTimestamp() 反映前のローカル書き込みでは null になる
    createdAt: d.createdAt ?? null,
    updatedAt: d.updatedAt ?? null,
    detectedUserIds: Array.isArray(d.detectedUserIds) ? d.detectedUserIds : undefined,
  };
}

/** ★ここのキー構成は Rules の validPost() と必ず一致させること★ */
export async function createPost(params: {
  uid: string;
  displayName: string;
  photoURL?: string | null;
  text: string;
  media: MediaItem[];
  visibleToTags: string[];
  /** 候補から選んだメンションの相手（本文に残っている人だけ。lib/mentions.ts の activeMentions） */
  mentioned?: MentionPerson[];
}) {
  const { uid, displayName, photoURL, text, media, visibleToTags } = params;
  const mentioned = (params.mentioned ?? []).slice(0, MAX_MENTIONS);

  if (!text.trim() && media.length === 0) throw new Error("本文か写真のどちらかは必要です");
  if (text.length > 2000) throw new Error("本文は2000文字までです");
  if (media.length > 4) throw new Error("メディアは4件までです");
  if (visibleToTags.length === 0) throw new Error("公開範囲を1つ以上選んでください");

  // 本文から #タグ と @メンションを抽出して保存する
  const { hashtags, mentions } = extractTags(text, mentioned.map((m) => m.name));

  return addDoc(collection(db, "posts"), {
    authorUid: uid,
    authorName: displayName,
    ...(photoURL ? { authorPhotoURL: photoURL } : {}),
    text: text.trim(),
    media,
    visibleToTags,
    hashtags,
    mentions,
    // ★相手がいるときだけ付ける★ Rules では任意のキー（hasOnly）。空のときは従来と同じ形で書く
    ...(mentioned.length > 0 ? { mentionUids: mentioned.map((m) => m.uid) } : {}),
    status: "visible",
    reactionCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
  });
}

/**
 * リアクションのトグル。
 * increment() の結果は Rules の request.resource で解決済みの値として見えるため、
 * 「±1 のみ許可」ルールをそのまま通過する。
 */
export async function toggleReaction(postId: string, uid: string, emoji = "❤️") {
  const postRef = doc(db, "posts", postId);
  const reactionRef = doc(db, "posts", postId, "reactions", uid);

  return runTransaction(db, async (tx) => {
    const existing = await tx.get(reactionRef);
    if (existing.exists()) {
      tx.delete(reactionRef);
      tx.update(postRef, { reactionCount: increment(-1), updatedAt: serverTimestamp() });
      return false;
    }
    tx.set(reactionRef, { emoji, uid, createdAt: serverTimestamp() });
    tx.update(postRef, { reactionCount: increment(1), updatedAt: serverTimestamp() });
    return true;
  });
}
