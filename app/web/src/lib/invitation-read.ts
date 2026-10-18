import { INVITATION_READ_STORAGE_KEY } from "@/config/invitation";

/**
 * 招待状を読んだ（回答した・一度最後まで読んだ）かどうかを、この端末に覚えておく（Issue #178）。
 * 2回目以降は、画面下の「エントリーする」を最初から出すため。
 * ★localStorage は読めないことがある★（プライベートブラウズなど）。読めなければ初回として扱う。
 * サーバーには送らない。
 */
export function hasReadInvitation(): boolean {
  try {
    return window.localStorage.getItem(INVITATION_READ_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markInvitationRead() {
  try {
    window.localStorage.setItem(INVITATION_READ_STORAGE_KEY, "1");
  } catch {
    /* 覚えられなくても困らない（次回も初回として扱うだけ） */
  }
}

/** 読んだ記録を消す。テスト画面（/admin/invitation_test）で、初めての人の動きを確かめ直すためだけに使う */
export function clearInvitationRead() {
  try {
    window.localStorage.removeItem(INVITATION_READ_STORAGE_KEY);
  } catch {
    /* 消せなくても困らない（テストの確認ができないだけ） */
  }
}
