/** ハートの形（24×24）。いいねのボタン・ギャラリーの印・ダブルタップの演出で共通 */
export const HEART_PATH =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

/**
 * いいねのハート。filled ならアクセントの色で塗り、そうでなければ文字の色の線だけ。
 *
 * ★絵文字（❤️）を使わない★ 絵文字の色は端末が決めるので、テーマ（config/theme.ts の accent）に従わない。
 *   /admin/design で配色を比べるとき、ハートの色が変わらないと差し色の効き方が分からない。
 * 大きさは className（h-4 w-4 など）で決める。
 */
export function HeartIcon({ filled, className = "h-4 w-4" }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`${className} shrink-0 ${filled ? "fill-accent-500" : "fill-none stroke-current"}`}
      strokeWidth={filled ? undefined : 1.8}
    >
      <path d={HEART_PATH} />
    </svg>
  );
}
