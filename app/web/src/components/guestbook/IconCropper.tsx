"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { IconCrop, IconSource } from "@/lib/image";
import {
  ICON_CROP_MARGIN_PX,
  ICON_CROP_MAX_DIAMETER_PX,
  ICON_CROP_MAX_ZOOM,
  ICON_CROP_PREVIEW_EDGE,
} from "@/config/profile";

/** 写真の位置と倍率。x / y は枠の中心から写真の中心までのずれ (px)、zoom は最小倍率に対する倍率 */
type View = { x: number; y: number; zoom: number };

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * アイコンの切り取り画面（全画面）。丸い枠の中に入れる範囲を、ドラッグと拡大・縮小で決める。
 * 「決定」で、枠に外接する正方形の範囲（写真の画素）を返す。切り取りそのものは lib/image.ts の cropForIcon。
 *
 * ★最小倍率は「円が写真に内接する大きさ」★ それより小さくできず、位置も写真の端で止める。
 *   枠の中に余白（黒い部分）を作らないため。
 * ★document.body へ Portal で出し、表示中は body を overflow: hidden にする★
 *   本文は引っ張って更新の間 transform が付くので、その中では画面に固定されない（PullToRefresh の★参照）。
 *   overflow: hidden は PullToRefresh と useCompactChrome が見ていて、裏の画面が動かなくなる。
 * ★写真を操作する面は touch-action: none★ ブラウザのスクロールやピンチでの画面の拡大に取られないようにする。
 *   スライダーには付けない（つまみを指で動かせなくなる端末があるため）。
 * ★動かすのは transform だけ★ 写真は表示用に縮めた canvas へ一度だけ描き、あとは位置と倍率を変える。
 */
export function IconCropper({
  source,
  onCancel,
  onDone,
}: {
  source: IconSource;
  onCancel: () => void;
  onDone: (crop: IconCrop) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  // 触れている指（pointerId → 位置）。1本ならドラッグ、2本ならピンチ
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  // 丸い枠の直径と、最小倍率のときの写真の表示サイズ
  const diameter = box
    ? Math.max(1, Math.min(box.w, box.h, ICON_CROP_MAX_DIAMETER_PX + ICON_CROP_MARGIN_PX * 2) - ICON_CROP_MARGIN_PX * 2)
    : 0;
  const baseScale = diameter / Math.min(source.width, source.height);
  const baseW = source.width * baseScale;
  const baseH = source.height * baseScale;

  /** 枠が写真の外へ出ないように収める */
  function fit(v: View): View {
    const zoom = clamp(v.zoom, 1, ICON_CROP_MAX_ZOOM);
    const maxX = Math.max(0, (baseW * zoom - diameter) / 2);
    const maxY = Math.max(0, (baseH * zoom - diameter) / 2);
    return { zoom, x: clamp(v.x, -maxX, maxX), y: clamp(v.y, -maxY, maxY) };
  }

  /** (cx, cy)（枠の中心からの位置）にある写真の点を動かさずに、倍率を変える */
  function zoomAt(v: View, nextZoom: number, cx: number, cy: number): View {
    const zoom = clamp(nextZoom, 1, ICON_CROP_MAX_ZOOM);
    const k = zoom / v.zoom;
    return fit({ zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
  }

  // 操作する面の大きさを測る（画面の回転やアドレスバーの出し入れにも追従する）
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 写真を表示用の canvas へ一度だけ描く
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const k = Math.min(1, ICON_CROP_PREVIEW_EDGE / Math.max(source.width, source.height));
    el.width = Math.max(1, Math.round(source.width * k));
    el.height = Math.max(1, Math.round(source.height * k));
    el.getContext("2d")?.drawImage(source.image, 0, 0, el.width, el.height);
  }, [source]);

  // 裏の画面を止める。PullToRefresh と useCompactChrome もこれを見る
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancel();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  /** 画面上の位置を、枠の中心からの位置に直す */
  function fromCenter(clientX: number, clientY: number) {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // 3本目以降の指は数えない
    if (pointers.current.size >= 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };

    if (pointers.current.size === 1) {
      pointers.current.set(e.pointerId, next);
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      setView((v) => fit({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }

    // ピンチ: 2本の指の間隔の変化で倍率を、中点の動きで位置を変える
    const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
    pointers.current.set(e.pointerId, next);
    if (!other) return;
    const before = Math.hypot(prev.x - other.x, prev.y - other.y);
    const after = Math.hypot(next.x - other.x, next.y - other.y);
    if (before <= 0 || after <= 0) return;
    const mid = fromCenter((next.x + other.x) / 2, (next.y + other.y) / 2);
    const dx = (next.x - prev.x) / 2;
    const dy = (next.y - prev.y) / 2;
    setView((v) => zoomAt({ ...v, x: v.x + dx, y: v.y + dy }, v.zoom * (after / before), mid.x, mid.y));
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
  }

  // 面の大きさが変わると収まる範囲も変わるので、描くたびに収め直した値を使う
  const shown = fit(view);

  function done() {
    if (!diameter) return;
    const scale = baseScale * shown.zoom;
    const size = diameter / scale;
    onDone({
      x: source.width / 2 - shown.x / scale - size / 2,
      y: source.height / 2 - shown.y / scale - size / 2,
      size,
    });
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="アイコンの切り取り"
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white"
    >
      <div className="flex items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 touch-manipulation rounded-full px-4 text-sm text-white/90 transition hover:bg-white/10"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={done}
          disabled={!diameter}
          className="min-h-11 touch-manipulation rounded-full px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
        >
          決定
        </button>
      </div>

      <div
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={(e) => {
          // マウスのホイール（PC での確認用）。指の操作と同じく、カーソルの位置を中心に拡大・縮小する
          const c = fromCenter(e.clientX, e.clientY);
          const factor = Math.exp(-e.deltaY / 400);
          setView((v) => zoomAt(v, v.zoom * factor, c.x, c.y));
        }}
        className="relative min-h-0 flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
      >
        <canvas
          ref={canvas}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none will-change-transform"
          style={{
            width: baseW,
            height: baseH,
            marginLeft: -baseW / 2,
            marginTop: -baseH / 2,
            transform: `translate3d(${shown.x}px, ${shown.y}px, 0) scale(${shown.zoom})`,
            visibility: diameter ? "visible" : "hidden",
          }}
        />
        {/* 丸い枠。外側は大きな影で暗くする */}
        {diameter > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full ring-2 ring-white/90"
            style={{
              width: diameter,
              height: diameter,
              marginLeft: -diameter / 2,
              marginTop: -diameter / 2,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)",
            }}
          />
        )}
      </div>

      <div className="px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <p className="mb-2 text-center text-xs text-white/70">ドラッグで位置、ピンチで大きさを変えられます</p>
        <label className="flex items-center gap-3">
          <span aria-hidden className="text-sm text-white/70">−</span>
          <input
            type="range"
            min={1}
            max={ICON_CROP_MAX_ZOOM}
            step={0.01}
            value={shown.zoom}
            onChange={(e) => {
              const zoom = Number(e.target.value);
              setView((v) => zoomAt(v, zoom, 0, 0));
            }}
            aria-label="拡大・縮小"
            className="h-11 min-w-0 flex-1 touch-manipulation accent-white"
          />
          <span aria-hidden className="text-lg text-white/70">＋</span>
        </label>
      </div>
    </div>,
    document.body,
  );
}
