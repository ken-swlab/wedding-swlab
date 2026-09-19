import type { Timestamp } from "firebase/firestore";

export type OriginalStatus = "pending" | "uploaded" | "failed";

export type MediaItem = {
  type: "image" | "video";
  /** 表示用の軽量版 URL */
  url: string;
  /** 軽量版のパス。原本をマージする際の照合キーにもなる */
  storagePath: string;
  width?: number;
  height?: number;
  alt?: string;

  // --- 二段階アップロードの原本 ---
  originalUrl?: string;
  originalPath?: string;
  originalBytes?: number;
  originalStatus?: OriginalStatus;
};

export type Post = {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhotoURL?: string;
  text: string;
  media: MediaItem[];
  /** ABAC の中核。閲覧者の tags と1つでも交差すれば可視 */
  visibleToTags: string[];
  /** 正規化済み（NFKC + 小文字）のタグ。表示用の生文字列は text 側にある */
  hashtags: string[];
  mentions: string[];
  status: "visible" | "hidden";
  reactionCount: number;
  commentCount: number;
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export type Comment = {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhotoURL?: string;
  text: string;
  hashtags: string[];
  mentions: string[];
  /** 親投稿からのコピー。Rules が一致を検証する */
  visibleToTags: string[];
  createdAt: Timestamp | null;
};

export type Guest = {
  uid: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  tags: string[];
};
