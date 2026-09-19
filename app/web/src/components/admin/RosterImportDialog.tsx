"use client";
import { useMemo, useState } from "react";
import { invitationDef } from "@/config/roster";
import { tagDef } from "@/config/tags";
import { normalizeName, parseRoster } from "@/lib/roster";
import type { GuestRow } from "@/types/admin";

const SAMPLE = `前川 太郎, まえかわ たろう, 新郎友人, 二次会, 送付済\n山田 花子, やまだ はなこ, 新婦友人, 未送付\n鈴木 一郎, 親族, 出席`;

export function RosterImportDialog({ existing, onClose, onImport }: { existing: GuestRow[]; onClose: () => void; onImport: (rows: { displayName: string; kana: string; tags: string[]; invitationStatus: string }[]) => Promise<void>; }) {
  const [text, setText] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingNames = useMemo(() => new Set(existing.map((g) => normalizeName(g.displayName))), [existing]);
  const parsed = useMemo(() => parseRoster(text, existingNames), [text, existingNames]);
  const target = skipDuplicates ? parsed.filter((r) => !r.duplicate) : parsed;
  const dupCount = parsed.filter((r) => r.duplicate).length;

  async function run() {
    if (target.length === 0) return;
    setBusy(true); setError(null);
    try {
      await onImport(target.map(({ displayName, kana, tags, invitationStatus }) => ({ displayName, kana, tags, invitationStatus })));
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "追加に失敗しました"); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 p-4">
          <div><h2 className="font-serif text-lg text-stone-900">名簿を一括追加</h2><p className="mt-1 text-xs leading-relaxed text-stone-500">1行に1人。カンマ・タブ区切り。<br /><span className="text-stone-400">「新郎友人」「二次会」などの語はそのままタグとして解釈されます。残りをふりがなとして扱います。</span></p></div>
          <button type="button" onClick={onClose} aria-label="閉じる" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">×</button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
          <div className="flex flex-col">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} placeholder={SAMPLE} spellCheck={false} className="w-full flex-1 resize-none rounded-xl border border-stone-200 bg-stone-50/50 p-3 font-mono text-xs leading-relaxed outline-none focus:border-stone-400 focus:bg-white" />
            <button type="button" onClick={() => setText(SAMPLE)} className="mt-2 self-start text-xs text-stone-400 underline hover:text-stone-700">サンプルを入れる</button>
          </div>
          <div className="min-h-0">
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-medium text-stone-600">プレビュー<span className="ml-1.5 tabular-nums text-stone-400">{parsed.length} 行</span></p>{dupCount > 0 && <label className="flex items-center gap-1.5 text-[11px] text-amber-700"><input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />重複 {dupCount} 件を除く</label>}</div>
            <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-stone-200">
              {parsed.length === 0 ? <p className="p-8 text-center text-xs text-stone-400">左に貼り付けるとここに結果が出ます</p> : (
                <ul className="divide-y divide-stone-100">
                  {parsed.map((r) => (
                    <li key={r.line} className={`flex items-start gap-2 px-2 py-1.5 ${r.duplicate && skipDuplicates ? "opacity-35" : ""}`}>
                      <div className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-stone-800">{r.displayName}</span>{r.kana && <span className="block truncate text-[10px] text-stone-400">{r.kana}</span>}
                        <div className="mt-0.5 flex flex-wrap gap-1">{r.tags.map((t) => <span key={t} className={`rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${tagDef(t).className}`}>{tagDef(t).label}</span>)}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${invitationDef(r.invitationStatus).className}`}>{invitationDef(r.invitationStatus).label}</span>
                      {r.duplicate && <span className="shrink-0 text-[10px] text-amber-600">既存</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-stone-100 p-4">
          <span className="text-xs text-rose-600">{error}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-stone-500 hover:bg-stone-100">キャンセル</button>
            <button type="button" onClick={() => void run()} disabled={busy || target.length === 0} className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? "追加中…" : `${target.length} 名を追加`}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
