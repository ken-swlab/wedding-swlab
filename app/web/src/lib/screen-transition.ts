/**
 * 黒い画面から明るい画面へ移るときの、つなぎ目の印（Issue #157 B-5）。
 *
 * 黒い画面（承認待ち）が閉じるときに mark し、次に開いた明るい画面が take して暗転から浮かび上がらせる。
 * ★端末に保存しない★ ページの中の移動（router.replace / Link）でだけ使う。読み込み直したら印は消えてよい。
 * ★古い印は使わない★ 黒い画面を閉じてから SCREEN_FADE_TTL_MS を過ぎた印は無視する
 *   （別の画面を経由して、あとで関係のない画面が暗転しないように）。
 */
export type DarkExit = "dark" | "approved";

const SCREEN_FADE_TTL_MS = 3000;

let mark: { kind: DarkExit; at: number } | null = null;

export function markDarkExit(kind: DarkExit) {
  mark = { kind, at: Date.now() };
}

/** 印を読む（消さない。React の開発時の二重呼び出しでも同じ値を返すため）。消すのは clearDarkExit */
export function peekDarkExit(): DarkExit | null {
  if (!mark || Date.now() - mark.at > SCREEN_FADE_TTL_MS) return null;
  return mark.kind;
}

export function clearDarkExit() {
  mark = null;
}
