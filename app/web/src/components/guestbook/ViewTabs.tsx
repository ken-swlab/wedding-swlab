"use client";

export type GuestbookView = "timeline" | "gallery";

const TABS: { key: GuestbookView; label: string; icon: string }[] = [
  { key: "timeline", label: "タイムライン", icon: "☰" },
  { key: "gallery", label: "ギャラリー", icon: "▦" },
];

export function ViewTabs({
  value,
  onChange,
}: {
  value: GuestbookView;
  onChange: (v: GuestbookView) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex rounded-full border border-stone-200 bg-white p-1 shadow-sm"
    >
      {TABS.map((t) => {
        const on = value === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium transition ${
              on ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-50"
            }`}
          >
            <span aria-hidden className="text-xs">{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
