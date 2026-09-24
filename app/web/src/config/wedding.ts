/**
 * 招待状に出す情報。
 * ★パスコードはここに書かない★ サーバーの WEDDING_PASSCODE だけが持つ。
 *   ここに書くとクライアントバンドルに載り、誰でも読める。
 */
export const WEDDING = {
  groom: "賢信",
  bride: "　",              // ←お名前を入れてください
  dateLabel: "2027年 5月 8日（土）",
  receptionAt: "12:00 受付　12:30 挙式",
  venueName: "　",          // ←会場名
  venueAddress: "　",       // ←住所
  venueMapUrl: "",          // Google マップの共有URL（任意）
  /** public/ に置いた画像のパス */
  heroImage: "/invitation/hero.jpg",
  greeting: [
    "このたび 私たちは結婚式を挙げることとなりました",
    "日頃お世話になっている皆さまに 感謝の気持ちをお伝えしたく",
    "ささやかながら 披露宴を催したいと存じます",
    "ご多用中 誠に恐縮ではございますが",
    "ぜひご出席いただけますと幸いです",
  ],
} as const;
