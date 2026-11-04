import { INVITATION_KIND_KEY } from "@/config/invitation";
import type { InvitationKind } from "@/types/admin";

/**
 * この端末で最後に開いた招待状の種類（友人用・親族用。Issue #240）。
 * 親族用の招待状でパスコードを通したあと、回答の前に閉じて /onboarding から答えるときに、親族用のフォームを出すため。
 * ★使い勝手のためだけ★ 記録として使うのは guestPrivate.invitationKind（サーバーが最初の回答のときに書く）。
 * ★localStorage は読めないことがある★ 読めなければ友人用。
 */
export function rememberInvitationKind(kind: InvitationKind) {
  try {
    window.localStorage.setItem(INVITATION_KIND_KEY, kind);
  } catch {
    /* 覚えられなくても先へ進む */
  }
}

export function recallInvitationKind(): InvitationKind {
  try {
    return window.localStorage.getItem(INVITATION_KIND_KEY) === "family" ? "family" : "friend";
  } catch {
    return "friend";
  }
}
