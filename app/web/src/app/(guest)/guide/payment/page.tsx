"use client";

import { GuideShell } from "@/components/guide/GuideShell";
import { PaymentMock } from "@/components/guide/PaymentMock";
import { PlaceholderPanel } from "@/components/guestbook/GuestbookShell";
import { useGuestSessionContext } from "@/components/guestbook/GuestSessionContext";

/**
 * Web ご祝儀・送金の状況。
 * ★今は UI モック（Issue #73）なので管理者にだけ見せる★ 送金先がダミーのため、ゲストには予告を出したままにする。
 *   バックエンド連携で本物の送金先と状況を出せるようになったら、ゲストにも見せる。
 */
export default function GuidePaymentPage() {
  const { isAdmin } = useGuestSessionContext();
  return (
    <GuideShell>
      {isAdmin ? (
        <PaymentMock />
      ) : (
        <PlaceholderPanel title="ご祝儀">Web ご祝儀と送金の状況は、こちらに表示される予定です。</PlaceholderPanel>
      )}
    </GuideShell>
  );
}
