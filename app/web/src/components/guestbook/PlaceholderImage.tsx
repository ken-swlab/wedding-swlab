"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { PLACEHOLDER_FADE_MS } from "@/config/guestbook";

/**
 * 写真のマスの中身（Issue #253）。写真が届く前に「下絵」（投稿のデータに入った長辺 16px の data URL）を
 * ぼかして敷き、本物が読み終わったら PLACEHOLDER_FADE_MS でふわっと重ねる。
 *
 * - 親は `relative` で大きさの決まった枠（縦横は今までどおり枠のクラスで決める。読み込みで画面がずれない）。
 * - 下絵は `blur(16px)`・少し拡大（`scale(1.1)`）。はみ出しは下絵の枠（overflow-hidden）で切る。
 *   ぼかすと縁が透けて灰色がにじむので、拡大して縁を外へ出す。
 * - 本物が読み終わったら、フェードが済んだあと下絵を外す（重ねたままにしない）。
 * - 下絵が無い古い投稿は、今までどおり（枠の灰色の上に、本物をそのまま出す。フェードもしない）。
 * ★下絵は data URL なので通信しない★（CSP の img-src は data: を許している。src/lib/csp.ts）
 */
export function PlaceholderImage({
  src, placeholder, alt, sizes, className = "",
}: {
  src: string;
  placeholder?: string;
  alt: string;
  sizes: string;
  /** 本物の写真に付けるクラス（object-cover・hover の拡大など） */
  className?: string;
}) {
  // 読み終わったか（src ごと。写真が差し替わったら、もう一度下絵から）
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [doneSrc, setDoneSrc] = useState<string | null>(null);
  const loaded = loadedSrc === src;
  const done = doneSrc === src;

  // フェードが済んだら下絵を外す
  useEffect(() => {
    if (!loaded || !placeholder) return;
    const t = window.setTimeout(() => setDoneSrc(src), PLACEHOLDER_FADE_MS + 50);
    return () => window.clearTimeout(t);
  }, [loaded, placeholder, src]);

  const fade = !!placeholder;
  return (
    <>
      {placeholder && !done && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <Image src={placeholder} alt="" fill sizes={sizes} className="scale-110 object-cover blur-[16px]" />
        </span>
      )}
      <span
        // ★duration-200 は PLACEHOLDER_FADE_MS と同じ値★（style 属性で書かない。CSP の style-src に当たるため）
        className={`absolute inset-0 ${fade ? "transition-opacity duration-200 ease-out" : ""} ${fade && !loaded ? "opacity-0" : "opacity-100"}`}
      >
        <Image src={src} alt={alt} fill sizes={sizes} className={className} onLoad={() => setLoadedSrc(src)} />
      </span>
    </>
  );
}
