import type { MediaItem } from "@/types";

/** 承認後の初回の演出に出す投稿（Issue #150）。postId が null なら仮の画像の演出（いいねは保存しない） */
export type WelcomeContent = {
  postId: string | null;
  /** 本文の一言 */
  message: string;
  /** 本物の投稿の写真（1枚目）。仮の画像なら null */
  media: Pick<MediaItem, "storagePath" | "url"> | null;
  /** 本物の投稿のいいねの数（演出の前の値）。仮なら 0 */
  reactionCount: number;
  /** 本物の投稿者のアイコン（無ければ null） */
  authorPhotoURL: string | null;
};

/** GET /api/guest/welcome の応答 */
export type WelcomeStatus = {
  /** 演出を出すか（承認のときに印が付き、まだ見ていない人だけ true） */
  show: boolean;
  content: WelcomeContent | null;
};
