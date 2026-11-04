"use client";
import { InvitationEntry } from "@/components/guestbook/InvitationEntry";

/** 友人用の招待状（中身は config/invitation）。ログインと API は InvitationEntry */
export default function InvitationPage() {
  return <InvitationEntry kind="friend" />;
}
