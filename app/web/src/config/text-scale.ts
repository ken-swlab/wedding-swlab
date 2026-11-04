/**
 * 文字の大きさ（Issue #243）。
 *
 * ★倍率は globals.css の :root[data-text-scale="large"] の1か所★（--inv-scale: 1.12・--inv-tap: 52px）
 *   <html> に data-text-scale="large" を付けると、Tailwind の text-xs〜text-3xl と、
 *   text-[length:calc(13px*var(--inv-scale))] の形で書いた文字が一緒に大きくなる。余白・アイコン・写真・並びは変わらない。
 *   付け外しは hooks/useTextScale.ts（ゲストの画面と親族用の招待状だけ。管理画面・/screen には付けない）。
 * ★本人の設定は guestPrivate.textScale★（POST /api/guest/preferences）。未設定なら、親族用から答えた人は大きく、
 *   友人用は今の大きさ。
 */
export const TEXT_SCALES = ["normal", "large"] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

/** 端末に覚えておく最後の大きさ（読み込みの直後に、いったん小さく出てから大きくなるちらつきを抑えるため） */
export const TEXT_SCALE_STORAGE_KEY = "wedding:text-scale";

/** 本人の設定（未設定は null）と招待状の種類から、実際の大きさを決める */
export function effectiveTextScale(pref: TextScale | null, invitationKind: "friend" | "family"): TextScale {
  return pref ?? (invitationKind === "family" ? "large" : "normal");
}
