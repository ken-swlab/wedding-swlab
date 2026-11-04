"use client";
import { InvitationEntry } from "@/components/guestbook/InvitationEntry";

/**
 * 親族用の招待状（Issue #240）。中身は config/invitation_family、出欠フォームは親族向け、文字は約 1.12 倍。
 * ★パスコードは友人用と共通★ URL を書き換えれば友人も開ける（中身に秘密の値を入れない。オーナー了承済み）。
 */
export default function FamilyInvitationPage() {
  return <InvitationEntry kind="family" />;
}
