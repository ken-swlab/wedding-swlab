"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { MOSAIC_COLS, MOSAIC_ROWS, SPOTLIGHT_HOLD_MS } from "@/config/screen";
import type { ScreenPhoto } from "@/hooks/useScreenData";

type Viewport = { w: number; h: number };

function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>({ w: 1920, h: 1080 });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

/**
 * 下から飛んできて中央で見せ、縮小しながら所定のセルへ着地する1枚。
 * セル1個分のサイズで配置し、transform だけで動かしている
 * （width/height を動かすとレイアウトが毎フレーム走って重い）。
 */
function Hero({
  photo,
  vp,
  onSettled,
}: {
  photo: ScreenPhoto;
  vp: Viewport;
  onSettled: () => void;
}) {
  const [phase, setPhase] = useState<"enter" | "settle">("enter");

  const cellW = vp.w / MOSAIC_COLS;
  const cellH = vp.h / MOSAIC_ROWS;
  const heroScale = (vp.h * 0.62) / cellH;

  const col = photo.slot % MOSAIC_COLS;
  const row = Math.floor(photo.slot / MOSAIC_COLS);

  useEffect(() => {
    const t = setTimeout(() => setPhase("settle"), SPOTLIGHT_HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  const spotlight = {
    x: vp.w / 2 - cellW / 2,
    y: vp.h * 0.46 - cellH / 2,
    scale: heroScale,
    rotate: 0,
    opacity: 1,
  };

  const landed = {
    x: col * cellW,
    y: row * cellH,
    scale: 1,
    rotate: 0,
    opacity: 1,
  };

  return (
    <motion.div
      initial={{
        x: vp.w / 2 - cellW / 2,
        y: vp.h + cellH,
        scale: heroScale * 0.55,
        rotate: -4,
        opacity: 0,
      }}
      animate={phase === "enter" ? spotlight : landed}
      transition={
        phase === "enter"
          ? { type: "spring", stiffness: 70, damping: 16, mass: 1.1, opacity: { duration: 0.4 } }
          : { duration: 1.0, ease: [0.4, 0, 0.2, 1] }
      }
      onAnimationComplete={() => {
        if (phase === "settle") onSettled();
      }}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: cellW,
        height: cellH,
        willChange: "transform",
        zIndex: 30,
      }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[6px] shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
        {/* next/image は使わない: 投影は原本の画質が命で、
            変換を挟むとライブ表示の遅延要因にもなる */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.src} alt="" className="h-full w-full object-cover" />
      </div>

      {phase === "enter" && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute left-1/2 w-max -translate-x-1/2 text-center text-white/90"
          style={{
            top: `calc(100% + ${cellH * (heroScale - 1) / 2}px + 2vh)`,
            fontSize: "2.4vh",
            textShadow: "0 2px 12px rgba(0,0,0,0.9)",
          }}
        >
          {photo.authorName}
        </motion.p>
      )}
    </motion.div>
  );
}

export function PhotoStage({
  cells,
  spotlight,
  onSettled,
}: {
  cells: (ScreenPhoto | null)[];
  spotlight: ScreenPhoto | null;
  onSettled: () => void;
}) {
  const vp = useViewport();

  return (
    <>
      {/* 背景モザイク */}
      <div className="fixed inset-0 z-0">
        <AnimatePresence>
          {cells.map((cell, i) =>
            cell ? (
              <motion.div
                key={cell.id}
                // ヒーローが同じ位置・同じ大きさで着地した直後に
                // 差し替わるため、登場アニメーションは付けない
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.6 } }}
                style={{
                  position: "absolute",
                  left: `${(i % MOSAIC_COLS) * (100 / MOSAIC_COLS)}%`,
                  top: `${Math.floor(i / MOSAIC_COLS) * (100 / MOSAIC_ROWS)}%`,
                  width: `${100 / MOSAIC_COLS}%`,
                  height: `${100 / MOSAIC_ROWS}%`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cell.src}
                  alt=""
                  className="h-full w-full object-cover opacity-55"
                />
              </motion.div>
            ) : null,
          )}
        </AnimatePresence>

        {/* コメントの可読性を上げるための減光 */}
        <div className="pointer-events-none absolute inset-0 bg-black/35" />
      </div>

      <AnimatePresence>
        {spotlight && (
          <Hero key={spotlight.id} photo={spotlight} vp={vp} onSettled={onSettled} />
        )}
      </AnimatePresence>
    </>
  );
}
