"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APPROVAL_STALE_MS } from "@/config/opening";

/**
 * 承認待ちで、承認が届いたら自動で先へ進める（Issue #156）。
 *
 * 承認そのものは guests/{uid} の購読（useGuestSession の isApproved）でリアルタイムに届く。
 * 先へ進むには ID トークンを取り直してタグ（Custom Claims）を反映する必要があるので、ここで refresh を呼ぶ:
 *   - approved が true になったとき（開いたまま承認された・承認後に開き直した、のどちらも）
 *   - 画面に戻ってきたとき（visibilitychange で表示に戻った）
 * タグが反映されたあとの遷移は呼び出し側が持つ（本番は (guest)/layout が /guestbook へ振り分け、演出（#150）が出る）。
 *
 * ★手動の再実行の案内は、自動で進めないときだけ★ refresh が失敗したか、承認から APPROVAL_STALE_MS（10 秒）
 *   たっても画面が残っているとき、stale を true にする（「画面が切り替わらない場合はこちら」）。
 * ★同時に 2 本走らせない★ 取り直しの途中に画面へ戻ってきても、重ねて呼ばない。
 */
export function useApprovalAdvance({
  approved,
  refresh,
}: {
  approved: boolean;
  /** ID トークンを取り直す（useGuestSession の refreshTags）。失敗したら reject する */
  refresh: () => Promise<unknown>;
}): { stale: boolean; retry: () => void } {
  const [timedOut, setTimedOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const refreshRef = useRef(refresh);
  const inFlight = useRef(false);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const run = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    refreshRef
      .current()
      .catch((e: unknown) => {
        console.error("[pending] 承認後のトークンの取り直しに失敗しました", e);
        setFailed(true);
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  useEffect(() => {
    if (!approved) return;
    run();
    const timer = setTimeout(() => setTimedOut(true), APPROVAL_STALE_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [approved, run]);

  return { stale: approved && (timedOut || failed), retry: run };
}
