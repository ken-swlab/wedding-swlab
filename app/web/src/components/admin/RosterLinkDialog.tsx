"use client";

import { useMemo, useState } from "react";
import { adminName } from "@/lib/names";
import { compareGuests, rosterCandidateLabel } from "@/lib/roster";
import type { GuestRow } from "@/types/admin";

/**
 * 承認済みのゲストを、あとから追加した名簿の行（仮ゲスト）と紐付ける（Issue #203）。
 *
 * 候補は仮ゲスト（isPreRegistered && !isRegistered）。並びは compareGuests、名前・ふりがなで絞り込める。
 * ★選んだあと、もう一度確かめてから紐付ける★ 統合（/api/admin/roster の merge）は取り消せない。
 *   名簿の顔・エピソードは本人へ移り、名簿のタグは本人のタグに足される（承認の状態は変えない）。
 */
export function RosterLinkDialog({
  guest,
  candidates,
  onLink,
  onClose,
}: {
  /** 紐付ける本人 */
  guest: GuestRow;
  /** 仮ゲスト（まだ誰とも紐付いていない名簿の行） */
  candidates: GuestRow[];
  /** 紐付ける。失敗したら Error を投げる（message を出す） */
  onLink: (preUid: string) => Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<GuestRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates
      .filter((g) => !needle || `${g.displayName} ${g.realName} ${g.kana}`.toLowerCase().includes(needle))
      .sort(compareGuests);
  }, [candidates, q]);

  async function confirm() {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onLink(picked.uid);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "紐付けられませんでした");
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="名簿と紐付ける" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <header className="border-b border-stone-100 p-4">
          <h2 className="font-serif text-lg text-stone-900">名簿と紐付ける</h2>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            「{adminName(guest)}」を、招待予定者リストの名簿の行と紐付けます。名簿の顔・エピソードは本人へ移り、名簿のタグは本人のタグに足されます。承認の状態は変わりません。
          </p>
        </header>
        {picked ? (
          <div className="space-y-3 p-4">
            <p className="text-sm leading-relaxed text-stone-700">
              名簿の「<span className="font-medium text-stone-900">{rosterCandidateLabel(picked)}</span>」を、本人の「<span className="font-medium text-stone-900">{adminName(guest)}</span>」と紐付けます。
            </p>
            <p className="text-xs leading-relaxed text-rose-600">この操作は取り消せません。</p>
            {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setPicked(null)} disabled={busy} className="min-h-11 flex-1 touch-manipulation rounded-full border border-stone-200 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-40">選び直す</button>
              <button type="button" onClick={() => void confirm()} disabled={busy} className="min-h-11 flex-1 touch-manipulation rounded-full bg-stone-900 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40">{busy ? "紐付けています…" : "紐付ける"}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-stone-100 p-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・ふりがなで絞り込む" aria-label="名前・ふりがなで絞り込む" className="min-h-11 w-full rounded-lg border border-stone-200 px-3 text-base outline-none focus:border-stone-400 md:text-sm" />
            </div>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
              {list.length === 0 ? (
                <li className="p-8 text-center text-xs leading-relaxed text-stone-400">
                  {candidates.length === 0 ? "紐付けられる名簿の行がありません。招待予定者リストで追加してください。" : "該当する名簿の行がありません"}
                </li>
              ) : (
                list.map((g) => (
                  <li key={g.uid}>
                    <button type="button" onClick={() => setPicked(g)} className="min-h-11 w-full touch-manipulation rounded-lg px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-100">
                      {rosterCandidateLabel(g)}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
        <footer className="border-t border-stone-100 p-3">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 w-full touch-manipulation rounded-full text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-40">キャンセル</button>
        </footer>
      </div>
    </div>
  );
}
