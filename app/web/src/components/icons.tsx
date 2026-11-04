import type { ReactNode } from "react";
import { HEART_PATH } from "@/components/guestbook/HeartIcon";

/**
 * 線のアイコン（Issue #227）。ゲスト側の UI で、絵文字や記号をアイコン代わりにしない。
 *
 * ★絵文字・記号をアイコンにしない理由★ 絵文字の絵柄と色は端末が決め（iPhone と Android で違う）、
 *   ☰ ◎ ⌕ などの記号は入っている書体によって太さ・大きさ・位置がばらばらになる。線のアイコンなら
 *   どの端末でも同じ形で、文字の色（currentColor）に従う。
 * ★線の太さは 1.6〜1.8、色は currentColor★ 大きさは className（h-5 w-5 など）で決める。aria-hidden 固定なので、
 *   意味はボタンの文字か aria-label で伝える。
 * 本文・プレースホルダー・知らせの文章の中の絵文字（🌿 など、文章として使っているもの）はそのまま。
 * いいねのハート（塗り・アクセント色）は guestbook/HeartIcon.tsx。
 */
type IconProps = { className?: string };

function Svg({ className = "h-5 w-5", strokeWidth = 1.7, children }: IconProps & { strokeWidth?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

/** 写真・動画を選ぶ（投稿の帯・投稿画面・写真の追加） */
export function CameraIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  );
}

/** 検索欄 */
export function SearchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </Svg>
  );
}

/** タブ: タイムライン */
export function TimelineIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h15" />
    </Svg>
  );
}

/** タブ: ギャラリー */
export function GalleryIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </Svg>
  );
}

/** タブ: コミュニティ（仲間） */
export function CommunityIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M15.5 14.3a4.5 4.5 0 0 1 5 5.2" />
    </Svg>
  );
}

/** タブ: 通知（いいね・メンション。線のハート） */
export function NotificationIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d={HEART_PATH} />
    </Svg>
  );
}

/** タブ: マイページ */
export function UserIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

/** ギャラリー: 写真を選んで保存する */
export function DownloadIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
    </Svg>
  );
}

/** コメント */
export function CommentIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 11.5a7.5 7.5 0 0 1-11.3 6.5L4 19.5l1.5-4.2A7.5 7.5 0 1 1 20 11.5z" />
    </Svg>
  );
}

/** 動画の印（再生の三角。小さくても形が分かるよう塗る） */
export function PlayIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="currentColor" className={`shrink-0 ${p.className ?? "h-5 w-5"}`}>
      <path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.3-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z" />
    </svg>
  );
}

/** 選んだ・済んだ */
export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={2}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

/** 切り替えメニューの「▾」 */
export function ChevronDownIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={1.8}>
      <path d="M7 10l5 5 5-5" />
    </Svg>
  );
}

/** 空間の切り替え: SNS・写真共有 */
export function FlowerIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={1.6}>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 10c-2.5-1.5-2.5-5 0-6 2.5 1 2.5 4.5 0 6zM12 14c2.5 1.5 2.5 5 0 6-2.5-1-2.5-4.5 0-6zM10 12c-1.5 2.5-5 2.5-6 0 1-2.5 4.5-2.5 6 0zM14 12c1.5-2.5 5-2.5 6 0-1 2.5-4.5 2.5-6 0z" />
    </Svg>
  );
}

/** 空間の切り替え: ご案内・各種手続き */
export function ClipboardIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5.5" y="5" width="13" height="16" rx="2" />
      <path d="M9 5V3.8h6V5M9 11h6M9 15h4" />
    </Svg>
  );
}

/** 管理者画面へのリンク */
export function CrownIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 8.5l4 3.5 4-6 4 6 4-3.5-1.5 10h-13z" />
    </Svg>
  );
}

/** 出欠・アンケート */
export function FormIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14 3.5V8h5M9 12.5h7M9 16.5h4.5" />
    </Svg>
  );
}

/** タブ: ご案内 */
export function EnvelopeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M4.5 7.5 12 13l7.5-5.5" />
    </Svg>
  );
}

/** タブ: 座席 */
export function SeatIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 11V5.5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 17 5.5V11" />
      <rect x="5" y="11" width="14" height="3.5" rx="1" />
      <path d="M7 14.5V20M17 14.5V20" />
    </Svg>
  );
}

/** タブ: 会費 */
export function YenIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 7.5l3 4.5 3-4.5M12 12v5M9.5 13h5M9.5 15.5h5" />
    </Svg>
  );
}

/** タブ: ミニAI（予定） */
export function SparkleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z" />
    </Svg>
  );
}

/** 待っている（会費の確認中など） */
export function HourglassIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={1.6}>
      <path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 4 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 4-8 8.5s8 4 8 8.5" />
    </Svg>
  );
}

/** 済んだ（会費の確認済みなど） */
export function CheckCircleIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={1.6}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12.5l3 3 5-6" />
    </Svg>
  );
}

/** お酒の量（ジョッキ） */
export function MugIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={1.6}>
      <path d="M5 8h10v10.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 18.5z" />
      <path d="M15 10.5h2a2 2 0 0 1 0 4h-2M5 8c0-1.7 1.6-2.7 3-2 1-1.5 3.5-1.5 4.5 0 1.5-.5 2.5.6 2.5 2" />
    </Svg>
  );
}

/** 地図のピン（ご案内の「当日のご案内」。Issue #241） */
export function MapPinIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </Svg>
  );
}
