import {
  collection, doc, increment, serverTimestamp, writeBatch,
  type DocumentData, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { countChars, extractTags, MAX_COMMENT_LENGTH } from "@/lib/text";
import type { MentionPerson } from "@/lib/mentions";
import { MAX_MENTIONS } from "@/config/mentions";
import type { Comment } from "@/types";

export function toComment(snap: QueryDocumentSnapshot<DocumentData>): Comment {
  const d = snap.data();
  return {
    id: snap.id,
    authorUid: d.authorUid,
    authorName: d.authorName ?? "ゲスト",
    authorPhotoURL: d.authorPhotoURL,
    text: d.text ?? "",
    hashtags: Array.isArray(d.hashtags) ? d.hashtags : [],
    mentions: Array.isArray(d.mentions) ? d.mentions : [],
    mentionUids: Array.isArray(d.mentionUids) ? d.mentionUids : [],
    visibleToTags: Array.isArray(d.visibleToTags) ? d.visibleToTags : [],
    createdAt: d.createdAt ?? null,
    hidden: d.hidden === true,
  };
}

/**
 * コメント作成 + 親のカウンタ更新をバッチで実行。
 * visibleToTags は親投稿の配列をそのまま渡すこと
 * （Rules が親との完全一致を要求している）。
 * 戻り値は作ったコメントの ID（メンションの通知を頼むのに使う）。
 */
export async function createComment(params: {
  postId: string;
  postVisibleToTags: string[];
  uid: string;
  displayName: string;
  photoURL?: string | null;
  text: string;
  /** 候補から選んだメンションの相手（本文に残っている人だけ。lib/mentions.ts の activeMentions） */
  mentioned?: MentionPerson[];
}): Promise<string> {
  const { postId, postVisibleToTags, uid, displayName, photoURL, text } = params;
  const mentioned = (params.mentioned ?? []).slice(0, MAX_MENTIONS);

  const body = text.trim();
  if (!body) throw new Error("コメントを入力してください");
  if (countChars(body) > MAX_COMMENT_LENGTH) {
    throw new Error(`コメントは${MAX_COMMENT_LENGTH}文字までです`);
  }

  const { hashtags, mentions } = extractTags(body, mentioned.map((m) => m.name));
  const commentRef = doc(collection(db, "posts", postId, "comments"));

  const batch = writeBatch(db);
  batch.set(commentRef, {
    authorUid: uid,
    authorName: displayName,
    ...(photoURL ? { authorPhotoURL: photoURL } : {}),
    text: body,
    hashtags,
    mentions,
    // ★相手がいるときだけ付ける★ Rules では任意のキー（hasOnly）。空のときは従来と同じ形で書く
    ...(mentioned.length > 0 ? { mentionUids: mentioned.map((m) => m.uid) } : {}),
    visibleToTags: postVisibleToTags,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, "posts", postId), {
    commentCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return commentRef.id;
}

export async function deleteComment(postId: string, commentId: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "posts", postId, "comments", commentId));
  batch.update(doc(db, "posts", postId), {
    commentCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}
