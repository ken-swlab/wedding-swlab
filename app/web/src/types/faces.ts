import type { Timestamp } from "firebase/firestore";

export type BoundingBox = {
  Left: number;
  Top: number;
  Width: number;
  Height: number;
};

export const IGNORED = "ignored";

export type FaceDoc = {
  id: string;
  postId: string;
  mediaIndex: number;
  imageUrl: string;
  boundingBox: BoundingBox;
  confidence: number;
  matchedGuestId: string | null;
  autoMatched: boolean;
  similarity: number;
  awsFaceId: string;
  authorUid: string;
  authorName: string;
  postText: string;
  createdAt: Timestamp | null;
};

export type FaceDetectionStatus = "pending" | "done" | "failed" | "skipped";
