import { OPENING_SEEN_KEY } from "@/config/opening";

/**
 * オープニングを見たかどうかを、この端末に覚えておく（Issue #131）。初回だけ自動で流すため。
 * ★localStorage は読めないことがある★（プライベートブラウズなど）。読めなければ「見ていない」として流す。
 * サーバーには送らない（見たかどうかは個人の情報として持たない）。
 */
export function hasSeenOpening(): boolean {
  try {
    return window.localStorage.getItem(OPENING_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOpeningSeen() {
  try {
    window.localStorage.setItem(OPENING_SEEN_KEY, "1");
  } catch {
    /* 覚えられなくても先へ進む（次回もう一度流れるだけ） */
  }
}
