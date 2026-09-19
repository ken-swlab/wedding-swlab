"use client";
import { useMemo } from "react";
import { classifyPerson, searchablePeople, type Person } from "@/lib/visibility";
import { compareGuests } from "@/lib/roster";

export function PersonFilter({ viewer, people, value, onChange }: { viewer: Person | null; people: Person[]; value: string; onChange: (uid: string) => void; }) {
  const groups = useMemo(() => {
    if (!viewer) return { self: [], couple: [], community: [] };
    const allowed = searchablePeople(viewer, people);
    const out: Record<"self" | "couple" | "community", Person[]> = { self: [], couple: [], community: [] };
    for (const p of allowed) out[classifyPerson(viewer, p)].push(p);
    const sortByKana = (list: Person[]) => [...list].sort((a, b) => compareGuests({ kana: a.kana, displayName: a.name }, { kana: b.kana, displayName: b.name }));
    return { self: out.self, couple: sortByKana(out.couple), community: sortByKana(out.community) };
  }, [viewer, people]);

  const total = groups.self.length + groups.couple.length + groups.community.length;
  if (!viewer || total === 0) return null;

  return (
    <div className="mb-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-stone-500">人物でしぼり込む</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-stone-400">
          <option value="">すべての写真</option>
          {groups.self.length > 0 && <optgroup label="自分">{groups.self.map((p) => <option key={p.uid} value={p.uid}>{p.name}（自分）</option>)}</optgroup>}
          {groups.couple.length > 0 && <optgroup label="新郎新婦">{groups.couple.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}</optgroup>}
          {groups.community.length > 0 && <optgroup label="同じグループの方">{groups.community.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}</optgroup>}
        </select>
      </label>
      <p className="mt-1.5 text-[11px] leading-relaxed text-stone-400">自分・新郎新婦・同じグループの方のみ選べます。</p>
    </div>
  );
}
