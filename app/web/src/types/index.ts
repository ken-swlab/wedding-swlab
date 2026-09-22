import type { Timestamp } from "firebase/firestore";

/**
 * 原本の状態。
 *
 *   pending     まだ端末から送信されていない
 *   uploaded    R2 の非公開バケットには届いた。ここから Worker の処理待ち
 *   published   EXIF を除去して公開バケットへ複製済み。originalUrl が使える
 *   skipped     Worker が処理できなかった（形式・サイズ・破損・期限切れ）
 *   failed      端末からの送信自体に失敗した
 *   unavailable 原本を持っていた端末が特定できない／消えた
 *
 * ★uploaded と published を分けている理由★
 *   以前は両方 "uploaded" だったため、R2 に届いただけの写真にも
 *   「HQ」バッジが出て、実際には軽量版が表示されていた。
 *   originalUrl が使えるのは published だけ。
 */
export type OriginalStatus =
  | "pending"
  | "uploaded"
  | "published"
  | "skipped"
  | "failed"
  | "unavailable";

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
  /** skipped のときだけ入る。UI に理由を出すために使う */
  originalSkipReason?: string;
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

  /**
   * 【予約】この写真に写っているゲストの uid。
   * 将来 AWS Rekognition 等で自動判定してバックエンドから書き込む想定。
   * エンドロールの「全員が最低1回は映る」選定に使う。
   * ★Admin SDK は Rules をバイパスするため、書き込み側に Rules の変更は不要★
   *   ただしクライアントからの編集は validPost の hasOnly で弾かれる。
   */
  detectedUserIds?: string[];
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
