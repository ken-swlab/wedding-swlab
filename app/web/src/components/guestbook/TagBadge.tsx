import { tagDef } from "@/config/tags";

export function TagBadge({ id }: { id: string }) {
  const t = tagDef(id);
  // 仕組み用のタグ（「承認済」）は出さない（Issue #204）
  if (t.system) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${t.className}`}
    >
      {t.label}
    </span>
  );
}
