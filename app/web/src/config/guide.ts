/**
 * 案内モード（/guide 以下）の画面構成。
 * ゲストブック（SNS）が「ゲスト同士の横の繋がり」なのに対し、こちらは新郎新婦からの案内と手続き。
 */
export const GUIDE_PATHS = {
  home: "/guide",
  questionnaire: "/guide/questionnaire",
  guests: "/guide/guests",
  payment: "/guide/payment",
} as const;

/**
 * ★承認済みゲストが留まれる /guide 以下のパス★
 *   (guest)/layout.tsx はここと isGuestbookPath の両方で false になるパスを /guestbook へ送り返す。
 *   /guide の下に画面を足したら、GUIDE_PATHS に足す。
 */
export function isGuidePath(pathname: string): boolean {
  return (Object.values(GUIDE_PATHS) as string[]).includes(pathname);
}

/**
 * アプリの空間。左上のロゴ（SpaceSwitch）で切り替える。
 * 管理画面（/admin）は別の画面で、ゲスト用のヘッダーとボトムナビを使わない。
 */
export type AppSpace = "guestbook" | "guide";
