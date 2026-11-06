"use client";

import { useRef, useState } from "react";
import type { Post } from "@/types";
import dynamic from "next/dynamic";
import { measureMedia, type MediaSize } from "./media-measure";

/** ★ビューアは開いたときに読む★（Issue #250。最初の JS を小さくする） */
const MediaLightbox = dynamic(() => import("./MediaLightbox").then((m) => m.MediaLightbox), { ssr: false });
import { feedSrc, posterSrc, thumbSrc } from "@/lib/media-url";
import { useDoubleTap, type TapPoint } from "@/hooks/useDoubleTap";
import { useHeartBursts } from "./HeartBurst";
import { PlayIcon } from "@/components/icons";
import { PlaceholderImage } from "./PlaceholderImage";

/** 枚数ごとのレイアウト。3枚のときだけ1枚目を大きく見せる */
function cellClass(count: number, i: number) {
  if (count === 1) return "col-span-2 aspect-[4/3]";
  if (count === 2) return "aspect-square";
  if (count === 3) return i === 0 ? "row-span-2 h-full" : "aspect-square";
  return "aspect-square";
}

/**
 * 投稿の写真・動画のマス。
 *
 * ★写真のマスは、1回タップを少し待ってからビューアを開く★（DOUBLE_TAP_MS。Issue #96）
 *   ダブルタップ（いいね）と見分けるため。2回目が来たらビューアを開かず、マスの上にハートを出す。
 *   動画のマスは待たずに開く（ダブルタップのいいねは無い）。
 * ★ビューアが広がる元になるマスの大きさ（measureMedia）は、1回目のタップの時点で測る★
 *   待ったあとではイベントの要素（currentTarget）が読めない。
 * ★マスに画質のバッジを出さない★（Issue #128）閲覧の邪魔になる。画質はマイページの自分の投稿にだけ、
 *   カードの右上のマーク（QualityMark）と外枠で伝える。
 * onLike: いいねを付ける（PostCard が渡す）。戻り値は成功したか。
 */
export function MediaGrid({ post, onLike }: { post: Post; onLike?: () => Promise<boolean> }) {
  const media = post.media;
  const doubleTap = useDoubleTap();
  const hearts = useHeartBursts();
  // ビューアはタップしたマスから広がり、閉じるときは今の写真のマスへ戻る
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState<{ index: number; size: MediaSize | null } | null>(null);
  if (media.length === 0) return null;

  const items = media.slice(0, 4);

  /** ダブルタップ: ハートは書き込みを待たずに出し、失敗したら知らせる */
  function like(point: TapPoint) {
    hearts.show(point);
    void onLike?.().then((ok) => {
      if (!ok) hearts.fail();
    });
  }

  return (
    <>
      <div
        className={`relative mt-3 grid grid-cols-2 gap-1 overflow-hidden rounded-xl ${
          items.length === 3 ? "grid-rows-2" : ""
        }`}
      >
        {items.map((m, i) => (
          <button
            key={m.storagePath || `${m.url}-${i}`}
            type="button"
            ref={(el) => {
              cells.current[i] = el;
            }}
            onClick={(e) => {
              const next = { index: i, size: measureMedia(e.currentTarget, m) };
              if (m.type === "video" || !onLike) setOpen(next);
              else doubleTap.tap(e, like, () => setOpen(next));
            }}
            // touch-manipulation: iOS のダブルタップでの拡大を止める
            className={`group relative touch-manipulation overflow-hidden bg-stone-100 ${cellClass(items.length, i)}`}
          >
            {m.type === "video" ? (
              <>
                {/* ★一覧では動画本体を読まない★（Issue #251）1枚目の画像があればそれを出し、押したらビューアで再生する。
                    無い古い投稿は今までどおり（動画の最初の部分だけを読む） */}
                {posterSrc(m) ? (
                  <PlaceholderImage src={posterSrc(m)!} placeholder={m.placeholder} alt={m.alt ?? ""} sizes="(max-width: 640px) 50vw, 300px" className="object-cover" />
                ) : (
                  <video src={thumbSrc(m)} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                )}
                <span className="absolute inset-0 flex items-center justify-center text-white/90 drop-shadow">
                  <PlayIcon className="h-9 w-9" />
                </span>
              </>
            ) : (
              // 一覧は長辺 828px の小さい版（Issue #251。無い古い投稿は軽量版）。届くまでは下絵をぼかして敷く（Issue #253）
              <PlaceholderImage
                src={feedSrc(m)}
                placeholder={m.placeholder}
                alt={m.alt ?? ""}
                sizes="(max-width: 640px) 50vw, 300px"
                className="object-cover transition duration-300 group-hover:scale-[1.03]"
              />
            )}

          </button>
        ))}
        {hearts.layer}
      </div>

      {open !== null && (
        <MediaLightbox
          post={post}
          media={items}
          startIndex={open.index}
          startSize={open.size}
          thumbRect={(i) => cells.current[i]?.getBoundingClientRect() ?? null}
          onLike={onLike}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
