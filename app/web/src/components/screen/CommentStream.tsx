"use client";

import { motion } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
import { COMMENT_LANES, COMMENT_SPEED_PX_PER_SEC } from "@/config/screen";
import type { ScreenMessage } from "@/hooks/useScreenData";

function FlowingText({
  message,
  onDone,
}: {
  message: ScreenMessage;
  onDone: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);

  // 文字幅を実測してから走らせる。固定値だと長文が
  // 画面左端で消えずに残ってしまう。
  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth ?? 600;
    setDistance(window.innerWidth + w + 64);
  }, []);

  // レーンは上端から 8% 〜 84% の範囲に均等配置
  const top = `${8 + (message.lane / COMMENT_LANES) * 76}%`;

  return (
    <motion.div
      ref={ref}
      initial={{ x: 0 }}
      animate={distance > 0 ? { x: -distance } : undefined}
      transition={{
        duration: distance / COMMENT_SPEED_PX_PER_SEC,
        ease: "linear",
      }}
      onAnimationComplete={() => onDone(message.id)}
      style={{
        position: "fixed",
        left: "100vw",
        top,
        whiteSpace: "nowrap",
        willChange: "transform",
        textShadow: "0 2px 12px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,1)",
      }}
      className="pointer-events-none select-none"
    >
      <span
        className={`font-medium ${
          message.kind === "post" ? "text-white" : "text-white/85"
        }`}
        style={{ fontSize: "3.4vh" }}
      >
        {message.text}
      </span>
      <span className="ml-3 text-white/45" style={{ fontSize: "2.1vh" }}>
        {message.authorName}
      </span>
    </motion.div>
  );
}

export function CommentStream({
  messages,
  onRetire,
}: {
  messages: ScreenMessage[];
  onRetire: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      {messages.map((m) => (
        <FlowingText key={m.id} message={m} onDone={onRetire} />
      ))}
    </div>
  );
}
