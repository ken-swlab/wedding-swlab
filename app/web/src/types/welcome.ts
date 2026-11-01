import type { MediaItem } from "@/types";
import type { WelcomeConfig } from "@/lib/welcome-config";

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

/** /admin/welcome（Issue #215）で選べる投稿。写真（1枚目）のある投稿だけ */
export type WelcomePostOption = {
  id: string;
  /** 写真（1枚目）。サムネイルは thumbSrc で組み立てる */
  media: Pick<MediaItem, "storagePath" | "url">;
  /** 本文の先頭（一覧で見分けるため） */
  text: string;
  visibleToTags: string[];
  status: "visible" | "hidden";
  /** 作成時刻（ms）。無ければ 0 */
  createdAt: number;
  /** 新郎新婦（couple タグの人）の投稿か。false は、設定に入っているが新郎新婦の投稿ではないもの */
  couple: boolean;
};

/** GET /api/admin/welcome の応答 */
export type AdminWelcomeStatus = {
  /** 今の設定。未設定なら空の設定。壊れていれば空の設定で、broken に項目名 */
  config: WelcomeConfig;
  broken: string | null;
  posts: WelcomePostOption[];
  /** 設定に入っているが見つからない投稿 ID */
  missing: string[];
};
