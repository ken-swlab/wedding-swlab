"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { postJson } from "@/lib/api-client";
import {
  MAX_TAGS_PER_GUEST,
  MAX_TAG_LABEL,
  PALETTE_KEYS,
  paletteClass,
  tagDef,
  upsertCustomTag,
} from "@/config/tags";
import { refreshTagCache, toTagDef, useTags, type CustomTagDoc } from "@/lib/tags-client";

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  max?: number;
};

const PANEL_W = 256;

export function TagPicker({
  value,
  onChange,
  disabled = false,
  max = MAX_TAGS_PER_GUEST,
}: Props) {
  const { allTags } = useTags();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [palette, setPalette] = useState<string>("rose");
  const [community, setCommunity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // ★ポップオーバーは portal で body に出す★
  //   テーブルの外枠が overflow-x-auto なので、absolute のままだと
  //   メニューがセルの外で切り落とされる。
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
      setCreating(false);
      setErr("");
    }
    function close() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const addable = useMemo(
    () => allTags.filter((t) => !value.includes(t.id)),
    [allTags, value],
  );
  const full = value.length >= max;

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      setPos({
        top: r.bottom + 4,
        left: Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8)),
      });
    }
    setErr("");
    setOpen(true);
  }

  function add(id: string) {
    if (full || value.includes(id)) return;
    onChange([...value, id]);
    setOpen(false);
  }

  async function create() {
    const name = label.trim();
    if (!name) {
      setErr("タグ名を入力してください");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await postJson<{ tag: { id: string } & CustomTagDoc }>("/api/admin/tags", {
        label: name,
        palette,
        community,
      });
      if (r.tag?.id) {
        // 購読が届く前でもラベルが出るよう、手元の辞書を先に更新する
        upsertCustomTag(toTagDef(r.tag.id, r.tag));
        refreshTagCache();
        if (!full) onChange([...value, r.tag.id]);
      }
      setLabel("");
      setCommunity(false);
      setCreating(false);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const panel = (
    <div
      ref={panelRef}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: PANEL_W }}
      className="fixed z-50 rounded-xl border border-stone-200 bg-white p-2 shadow-xl"
    >
      {full ? (
        <p className="p-2 text-[11px] text-rose-600">タグは1人 {max} 個までです</p>
      ) : addable.length === 0 ? (
        <p className="p-2 text-[11px] text-stone-400">追加できるタグがありません</p>
      ) : (
        <div className="max-h-48 space-y-0.5 overflow-y-auto">
          {addable.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => add(t.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-stone-100"
            >
              <span
                className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ${t.className}`}
              />
              <span className="truncate text-xs text-stone-700">{t.label}</span>
              {t.community && (
                <span className="ml-auto shrink-0 text-[9px] text-stone-400">コミュニティ</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="mt-1 border-t border-stone-100 pt-1">
        {!creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-stone-700 hover:bg-stone-100"
          >
            ＋ 新しいタグを作成…
          </button>
        ) : (
          <div className="space-y-1.5 p-1">
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void create();
                }
              }}
              maxLength={MAX_TAG_LABEL}
              placeholder="大学サークル"
              className="w-full rounded border border-stone-300 px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-stone-500 focus:outline-none"
            />
            <div className="flex flex-wrap gap-1">
              {PALETTE_KEYS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={p}
                  onClick={() => setPalette(p)}
                  className={`h-5 w-5 rounded-full ring-1 ring-inset ${paletteClass(p)} ${
                    palette === p ? "outline outline-2 outline-offset-1 outline-stone-800" : ""
                  }`}
                />
              ))}
            </div>
            <label className="flex items-start gap-1.5 text-[10px] leading-tight text-stone-500">
              <input
                type="checkbox"
                checked={community}
                onChange={(e) => setCommunity(e.target.checked)}
                className="mt-0.5 h-3 w-3"
              />
              <span>
                コミュニティとして扱う（このタグを共有するゲスト同士が、ギャラリーの人物検索の対象になります）
              </span>
            </label>
            {err && <p className="text-[10px] text-rose-600">{err}</p>}
            <div className="flex gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void create()}
                className="flex-1 rounded bg-stone-900 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
              >
                {busy ? "作成中…" : "作成して追加"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setErr("");
                }}
                className="rounded border border-stone-200 px-2 py-1 text-[11px] text-stone-500"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
      {err && !creating && <p className="px-2 pb-1 text-[10px] text-rose-600">{err}</p>}
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((t) => {
        const d = tagDef(t);
        return (
          <span
            key={t}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${d.className}`}
          >
            {d.label}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== t))}
                className="opacity-50 hover:opacity-100"
              >
                ×
              </button>
            )}
          </span>
        );
      })}
      {!disabled && (
        <button
          ref={btnRef}
          type="button"
          onClick={toggle}
          className="rounded-full border border-dashed border-stone-300 bg-white px-2 py-0.5 text-[11px] text-stone-400 hover:border-stone-400 hover:text-stone-600"
        >
          ＋
        </button>
      )}
      {open && pos && typeof document !== "undefined" && createPortal(panel, document.body)}
    </div>
  );
}
