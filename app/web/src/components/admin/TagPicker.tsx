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
import { useVisualViewportFrame } from "@/hooks/useVisualViewportFrame";

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  max?: number;
};

const PANEL_W = 256;
/** スマホ幅、またはタッチ操作の端末（横向きの iPhone・iPad も含む）ではボトムシートで出す */
const SHEET_QUERY = "(max-width: 639px), (pointer: coarse)";

export function TagPicker({
  value,
  onChange,
  disabled = false,
  max = MAX_TAGS_PER_GUEST,
}: Props) {
  const { allTags } = useTags();
  const [open, setOpen] = useState(false);
  // 開いた時点で決める。true ならボトムシート、false なら「＋」の下のポップオーバー（PC）
  const [sheet, setSheet] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [palette, setPalette] = useState<string>("rose");
  const [community, setCommunity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // ★閉じるときは作成フォームの状態も必ず戻す★（Issue #126）
  //   creating が true のまま閉じると、次に開いた瞬間に入力欄が autoFocus され、
  //   iOS がフォーカスに合わせて画面を動かす → scroll で閉じる、を繰り返して「＋」が効かなくなる。
  function close() {
    setOpen(false);
    setCreating(false);
    setErr("");
    setLabel("");
    setCommunity(false);
  }

  // ★ポップオーバーは portal で body に出す★
  //   テーブルの外枠が overflow-x-auto なので、absolute のままだと
  //   メニューがセルの外で切り落とされる。
  // ポップオーバー（PC）は開いた瞬間の座標に置くので、外側の操作・スクロール・リサイズで閉じる。
  // ボトムシートは位置を計算しないので、ここでは何も聞かない（背景のタップで閉じる）。
  useEffect(() => {
    if (!open || sheet) return;
    function inPanel(t: EventTarget | null) {
      return t instanceof Node && !!panelRef.current?.contains(t);
    }
    function onDown(e: PointerEvent) {
      if (inPanel(e.target) || btnRef.current?.contains(e.target as Node)) return;
      close();
    }
    // ★パネルの中のスクロールと、入力中のスクロール・リサイズでは閉じない★
    //   capture で聞いているので、タグ一覧（overflow-y-auto）のスクロールもここに届く。
    //   入力欄にフォーカスがある間は、キーボードの出し入れでも scroll / resize が起きる。
    function onMove(e: Event) {
      if (inPanel(e.target) || inPanel(document.activeElement)) return;
      close();
    }
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, sheet]);

  // シートの間は裏の画面を止める
  useEffect(() => {
    if (!open || !sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, sheet]);

  // キーボードが開いたら、シートの枠を見えている範囲に縮める（シートがキーボードのすぐ上に来る）
  useVisualViewportFrame(frameRef, open && sheet);

  const addable = useMemo(
    () => allTags.filter((t) => !value.includes(t.id)),
    [allTags, value],
  );
  const full = value.length >= max;

  function toggle() {
    if (open) {
      close();
      return;
    }
    const asSheet = window.matchMedia(SHEET_QUERY).matches;
    const r = btnRef.current?.getBoundingClientRect();
    setSheet(asSheet);
    if (r && !asSheet) {
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
    close();
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
      close();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  // シートは指で押すので、文字とタップ領域（44px 以上）を大きくする。PC のポップオーバーは従来の大きさ
  const body = (
    <>
      {sheet && creating ? null : full ? (
        <p className={`p-2 text-rose-600 ${sheet ? "text-sm" : "text-[11px]"}`}>タグは1人 {max} 個までです</p>
      ) : addable.length === 0 ? (
        <p className={`p-2 text-stone-400 ${sheet ? "text-sm" : "text-[11px]"}`}>追加できるタグがありません</p>
      ) : (
        <div className={`space-y-0.5 overflow-y-auto ${sheet ? "max-h-[40dvh] overscroll-contain" : "max-h-48"}`}>
          {addable.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => add(t.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-stone-100 ${
                sheet ? "min-h-11 touch-manipulation py-2" : "py-1"
              }`}
            >
              <span
                className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ${t.className}`}
              />
              <span className={`truncate text-stone-700 ${sheet ? "text-sm" : "text-xs"}`}>{t.label}</span>
              {t.community && (
                <span className={`ml-auto shrink-0 text-stone-400 ${sheet ? "text-[11px]" : "text-[9px]"}`}>
                  コミュニティ
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className={sheet && creating ? "" : "mt-1 border-t border-stone-100 pt-1"}>
        {!creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={`w-full rounded-lg px-2 text-left font-medium text-stone-700 hover:bg-stone-100 ${
              sheet ? "min-h-11 touch-manipulation py-2 text-sm" : "py-1.5 text-xs"
            }`}
          >
            ＋ 新しいタグを作成…
          </button>
        ) : (
          <div className={sheet ? "space-y-3 p-1" : "space-y-1.5 p-1"}>
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
              aria-label="タグ名"
              // ★文字は 16px（text-base）以上★ iOS は 16px 未満の入力欄にフォーカスすると画面を自動で拡大する（Issue #126）
              className={`w-full rounded border border-stone-300 px-2 text-base text-gray-900 placeholder:text-gray-400 focus:border-stone-500 focus:outline-none ${
                sheet ? "py-2" : "py-1"
              }`}
            />
            <div className={`flex flex-wrap ${sheet ? "gap-2" : "gap-1"}`}>
              {PALETTE_KEYS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={p}
                  onClick={() => setPalette(p)}
                  aria-pressed={palette === p}
                  className={`rounded-full ring-1 ring-inset ${sheet ? "h-9 w-9 touch-manipulation" : "h-5 w-5"} ${paletteClass(p)} ${
                    palette === p ? "outline outline-2 outline-offset-1 outline-stone-800" : ""
                  }`}
                />
              ))}
            </div>
            <label
              className={`flex items-start text-stone-500 ${
                sheet ? "gap-2 text-xs leading-relaxed" : "gap-1.5 text-[10px] leading-tight"
              }`}
            >
              <input
                type="checkbox"
                checked={community}
                onChange={(e) => setCommunity(e.target.checked)}
                className={sheet ? "mt-0.5 h-4 w-4 shrink-0" : "mt-0.5 h-3 w-3"}
              />
              <span>
                コミュニティとして扱う（このタグを共有するゲスト同士が、ギャラリーの人物検索の対象になります）
              </span>
            </label>
            {err && (
              <p role="alert" className={`text-rose-600 ${sheet ? "text-xs" : "text-[10px]"}`}>
                {err}
              </p>
            )}
            <div className={`flex ${sheet ? "gap-2" : "gap-1"}`}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void create()}
                className={`flex-1 bg-stone-900 font-medium text-white disabled:opacity-50 ${
                  sheet ? "min-h-11 touch-manipulation rounded-full px-4 text-sm" : "rounded px-2 py-1 text-[11px]"
                }`}
              >
                {busy ? "作成中…" : "作成して追加"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setErr("");
                }}
                className={`border border-stone-200 text-stone-500 ${
                  sheet ? "min-h-11 touch-manipulation rounded-full px-4 text-sm" : "rounded px-2 py-1 text-[11px]"
                }`}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  // ★スマホはボトムシート★（Issue #126）
  //   「＋」の座標に fixed で置く方式は、iOS のキーボードや拡大で画面が動くと位置がずれる。
  //   シートは画面の下端に置くだけなので位置の計算が要らない。枠は useVisualViewportFrame で
  //   見えている範囲に合わせるので、キーボードが開いてもシートはその上に出る。
  const panel = sheet ? (
    <div
      ref={frameRef}
      role="dialog"
      aria-modal="true"
      aria-label="タグを追加"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
      className="fixed inset-x-0 top-0 z-50 flex h-dvh items-end justify-center bg-black/40"
    >
      <div
        ref={panelRef}
        className="max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-3 pt-2 shadow-xl"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between pl-2">
          <p className="text-sm font-medium text-stone-800">{creating ? "新しいタグを作成" : "タグを追加"}</p>
          <button
            type="button"
            disabled={busy}
            onClick={close}
            className="min-h-11 touch-manipulation px-3 text-sm text-stone-500 disabled:opacity-40"
          >
            閉じる
          </button>
        </div>
        {body}
      </div>
    </div>
  ) : (
    <div
      ref={panelRef}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: PANEL_W }}
      className="fixed z-50 rounded-xl border border-stone-200 bg-white p-2 shadow-xl"
    >
      {body}
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
                aria-label={`${d.label} を外す`}
                // タッチ端末では、見た目を変えずに当たり判定だけ広げる（チップが並ぶので 44px の箱は置けない）
                className="relative opacity-50 hover:opacity-100 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-3"
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
          aria-label="タグを追加"
          aria-expanded={open}
          className="relative rounded-full border border-dashed border-stone-300 bg-white px-2 py-0.5 text-[11px] text-stone-400 hover:border-stone-400 hover:text-stone-600 pointer-coarse:px-3 pointer-coarse:py-1 pointer-coarse:text-sm pointer-coarse:after:absolute pointer-coarse:after:-inset-x-3 pointer-coarse:after:-inset-y-3"
        >
          ＋
        </button>
      )}
      {open && (sheet || pos) && typeof document !== "undefined" && createPortal(panel, document.body)}
    </div>
  );
}
