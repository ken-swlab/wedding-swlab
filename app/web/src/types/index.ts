import type { Timestamp } from "firebase/firestore";

export type MediaItem = {
  type: "image" | "video";
  url: string;
  storagePath: string;
  width?: number;
  height?: number;
  alt?: string;
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
  status: "visible" | "hidden";
  reactionCount: number;
  commentCount: number;
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export type Guest = {
  uid: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  tags: string[];
};
