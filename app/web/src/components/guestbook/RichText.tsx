"use client";

import { Fragment } from "react";
import { tokenizeText } from "@/lib/text";

/**
 * 本文中の #ハッシュタグ / @メンション をハイライトして描画する。
 * 検索画面ができるまでは onTokenClick 未指定＝ただの色付きテキスト。
 */
export function RichText({
  text,
  className,
  onTokenClick,
}: {
  text: string;
  className?: string;
  onTokenClick?: (kind: "hashtag" | "mention", key: string) => void;
}) {
  const tokens = tokenizeText(text);

  return (
    <span className={className}>
      {tokens.map((t, i) => {
        if (t.kind === "text") return <Fragment key={i}>{t.value}</Fragment>;

        const color = t.kind === "hashtag" ? "text-sky-600" : "text-violet-600";

        if (!onTokenClick) {
          return (
            <span key={i} className={`${color} font-medium`}>
              {t.value}
            </span>
          );
        }

        return (
          <button
            key={i}
            type="button"
            onClick={() => onTokenClick(t.kind, t.key)}
            className={`${color} font-medium hover:underline`}
          >
            {t.value}
          </button>
        );
      })}
    </span>
  );
}
