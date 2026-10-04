import "server-only";
import type { InvitationContent } from "@/types/invitation";

/**
 * 招待状に出す情報。
 *
 * ★サーバー専用★
 *   クライアントから import するとバンドルに載り、ログインしなくても
 *   誰でも名前・会場・住所を読めてしまう。中身はパスコードを通った人にだけ
 *   GET /api/guest/invitation が返す。"server-only" がクライアントからの
 *   import をビルドエラーにする。
 *
 * ★パスコードはここに書かない★ サーバーの WEDDING_PASSCODE だけが持つ。
 *
 * ★新郎新婦の写真を public/ に置かない★
 *   public/ の中身は URL を知っていれば誰でも取れる。
 */
export const WEDDING: InvitationContent = {
  groom: "賢信",
  bride: "　",              // ←お名前を入れてください
  dateLabel: "2027年 5月29日（土）",
  receptionAt: "12:00 受付　12:30 挙式",
  venueName: "　",          // ←会場名
  venueAddress: "　",       // ←住所
  venueMapUrl: "",          // Google マップの共有URL（任意）
  greeting: [
    "このたび 私たちは結婚式を挙げることとなりました",
    "日頃お世話になっている皆さまに 感謝の気持ちをお伝えしたく",
    "ささやかながら 披露宴を催したいと存じます",
    "ご多用中 誠に恐縮ではございますが",
    "ぜひご出席いただけますと幸いです",
  ],
};
