"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GUIDE_PATHS } from "@/config/guide";
import { GuideShell } from "@/components/guide/GuideShell";
import { PaymentMock } from "@/components/guide/PaymentMock";
import { PlaceholderPanel } from "@/components/guestbook/GuestbookShell";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";

/**
 * 会費（Issue #148 で「ご祝儀」から改名。公式 LINE のリッチメニューと合わせる）。
 * ★今は管理者にだけ見せる★ 内訳と合計は本物（GET /api/guest/payment）だが、送金先と送金状況はまだモック
 *   （Issue #73）。ゲストが本物と思ってダミーの送金先へ送金しないよう、ゲストには予告を出したままにする。
 *   送金先を本物にしたら、ゲストにも見せる。
 */
export default function GuidePaymentPage() {
  const { isAdmin, invitationKind } = useGuestSessionContext();
  const router = useRouter();
  // ★親族用から入った人は、ご案内のトップへ移す★（Issue #243。会費は手渡しなので、このタブは出していない）
  const family = invitationKind === "family" && !isAdmin;
  useEffect(() => {
    if (family) router.replace(GUIDE_PATHS.home);
  }, [family, router]);
  if (family) return <GuideShell>{null}</GuideShell>;
  return (
    <GuideShell>
      {isAdmin ? (
        <PaymentMock />
      ) : (
        <PlaceholderPanel title="会費">会費の内訳と送金の方法は、こちらに表示される予定です。</PlaceholderPanel>
      )}
    </GuideShell>
  );
}
