import {
  collection, doc, increment, serverTimestamp, writeBatch,
  type DocumentData, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { countChars, extractTags, MAX_COMMENT_LENGTH } from "@/lib/text";
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
    visibleToTags: Array.isArray(d.visibleToTags) ? d.visibleToTags : [],
    createdAt: d.createdAt ?? null,
  };
}

/**
 * コメント作成 + 親のカウンタ更新をバッチで実行。
 * visibleToTags は親投稿の配列をそのまま渡すこと
 * （Rules が親との完全一致を要求している）。
 */
export async function createComment(params: {
  postId: string;
  postVisibleToTags: string[];
  uid: string;
  displayName: string;
  photoURL?: string | null;
  text: string;
}) {
  const { postId, postVisibleToTags, uid, displayName, photoURL, text } = params;

  const body = text.trim();
  if (!body) throw new Error("コメントを入力してください");
  if (countChars(body) > MAX_COMMENT_LENGTH) {
    throw new Error(`コメントは${MAX_COMMENT_LENGTH}文字までです`);
  }

  const { hashtags, mentions } = extractTags(body);
  const commentRef = doc(collection(db, "posts", postId, "comments"));

  const batch = writeBatch(db);
  batch.set(commentRef, {
    authorUid: uid,
    authorName: displayName,
    ...(photoURL ? { authorPhotoURL: photoURL } : {}),
    text: body,
    hashtags,
    mentions,
    visibleToTags: postVisibleToTags,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, "posts", postId), {
    commentCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
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
