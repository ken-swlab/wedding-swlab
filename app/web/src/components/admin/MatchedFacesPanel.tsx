"use client";
import { useMemo, useState } from "react";
import { FaceThumbnail } from "@/components/admin/FaceThumbnail";
import { compareGuests } from "@/lib/roster";
import { IGNORED, type FaceDoc } from "@/types/faces";
import type { GuestRow } from "@/types/admin";

type Group = { key: string; label: string; sub: string; faces: FaceDoc[]; autoCount: number; isIgnored: boolean; };

export function MatchedFacesPanel({ faces, guests, loading, onUnmatch }: { faces: FaceDoc[]; guests: GuestRow[]; loading: boolean; onUnmatch: (face: FaceDoc) => Promise<void>; }) {
  const [q, setQ] = useState("");
  const [onlyAuto, setOnlyAuto] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const byUid = useMemo(() => new Map(guests.map((g) => [g.uid, g])), [guests]);

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, FaceDoc[]>();
    for (const f of faces) {
      if (onlyAuto && !f.autoMatched) continue;
      const key = f.matchedGuestId ?? "";
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(f);
    }
    const out: Group[] = [];
    for (const [key, list] of m) {
      if (key === IGNORED) {
        out.push({ key, label: "無視した顔", sub: "人物ではない / 対象外", faces: list, autoCount: 0, isIgnored: true });
        continue;
      }
      const g = byUid.get(key);
      out.push({
        key, label: g ? g.nickname || g.displayName : `（不明: ${key.slice(0, 12)}…）`, sub: g ? g.kana || g.displayName : "名簿に存在しません",
        faces: list, autoCount: list.filter((f) => f.autoMatched).length, isIgnored: false,
      });
    }
    const needle = q.trim().toLowerCase();
    return out.filter((g) => !needle || `${g.label} ${g.sub}`.toLowerCase().includes(needle)).sort((a, b) => {
      if (a.isIgnored !== b.isIgnored) return a.isIgnored ? 1 : -1;
      if (a.isIgnored) return 0;
      const ga = byUid.get(a.key); const gb = byUid.get(b.key);
      if (ga && gb) return compareGuests(ga, gb);
      return a.label.localeCompare(b.label, "ja");
    });
  }, [faces, byUid, q, onlyAuto]);

  const autoTotal = faces.filter((f) => f.autoMatched).length;

  async function unmatch(face: FaceDoc) {
    setBusy((b) => ({ ...b, [face.id]: true }));
    try { await onUnmatch(face); } finally { setBusy((b) => ({ ...b, [face.id]: false })); }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で絞り込む" className="min-w-[180px] flex-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-stone-400" />
        <button type="button" onClick={() => setOnlyAuto((v) => !v)} className={`rounded-full px-3 py-1.5 text-sm transition ${onlyAuto ? "bg-indigo-600 text-white" : "bg-white text-stone-600 hover:bg-stone-100"}`}>自動判定のみ<span className={`ml-1.5 rounded-full px-1.5 text-xs tabular-nums ${onlyAuto ? "bg-white/20" : "bg-indigo-100 text-indigo-800"}`}>{autoTotal}</span></button>
        <span className="ml-auto text-xs text-stone-400">{groups.length} 名</span>
      </div>
      {loading ? <div className="h-64 animate-pulse rounded-2xl bg-stone-200/60" /> : groups.length === 0 ? <p className="rounded-2xl border border-dashed border-stone-300 p-12 text-center text-sm text-stone-400">{onlyAuto ? "自動判定された顔はまだありません" : "紐付け済みの顔はまだありません"}</p> : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.key} className={`rounded-xl border p-3 ${g.isIgnored ? "border-stone-200 bg-stone-50" : "border-stone-200 bg-white"}`}>
              <header className="mb-2.5 flex items-baseline gap-2"><h3 className="text-sm font-medium text-stone-800">{g.label}</h3><span className="truncate text-[11px] text-stone-400">{g.sub}</span><span className="ml-auto shrink-0 text-xs tabular-nums text-stone-400">{g.faces.length} 件{g.autoCount > 0 && <span className="ml-1.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">自動 {g.autoCount}</span>}</span></header>
              <div className="flex flex-wrap gap-2.5">
                {g.faces.map((f) => (
                  <div key={f.id} className="group relative">
                    <FaceThumbnail src={f.imageUrl} box={f.boundingBox} size={72} className={f.autoMatched ? "ring-2 ring-indigo-300" : ""} />
                    {f.autoMatched && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-1.5 py-px text-[9px] tabular-nums text-white">{Math.round(f.similarity)}%</span>}
                    <button type="button" onClick={() => void unmatch(f)} disabled={busy[f.id]} className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-stone-900/80 text-xs text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 disabled:opacity-50">{busy[f.id] ? "…" : "×"}</button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
