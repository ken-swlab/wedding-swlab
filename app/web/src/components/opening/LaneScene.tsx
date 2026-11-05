"use client";

import { useEffect, useRef, useState } from "react";
import { LANE_BRIDE, LANE_COUNT, LANE_FONT_MIN_PX, LANE_FONT_PX, LANE_GROOM, LANE_GUEST, MONO, NAME_SCALE_MAX, NAME_SIDE_MARGIN_PX, OPENING_COLORS, OPENING_TIMING } from "@/config/opening";
import { createTimeline, prefersReducedMotion } from "./timeline";

const LANES = Array.from({ length: LANE_COUNT }, (_, i) => i + 1);
/** 大きく出す名前の行の高さ（文字の大きさに対する比） */
const LINE = 1.25;
/** レーン表の上に空けておく高さ (px)。大きな名前と「N レーン」はここに出す */
const ANNOUNCE_AREA_PX = 150;

/**
 * 2. レーン発表。黒背景の8レーンの表に、3レーン（新郎）→ 5レーン（新婦）→ 4レーン（ゲスト）の順で名前を入れる。
 * 名前はレーン表の上の空きに大きく出し、そのあと縮んで該当のレーンに収まる。
 *
 * ★大きな名前とレーン表が重ならないようにする★
 *   表の上に ANNOUNCE_AREA_PX の空きを必ず取り、大きな名前はその中に置く。出している間は表を暗くする。
 * ★長い名前は1行に収める★
 *   レーンの中は、はみ出すぶんだけ文字を小さくする（下限 LANE_FONT_MIN_PX）。
 *   大きく出すときは、画面の幅に収まる倍率までしか拡大しない。
 * ★動かすのは transform と opacity だけ★ 飛ぶ名前は1つの要素を使い回し、位置は transform で決める。
 */
export function LaneScene({ couple, guestName, onDone }: { couple: readonly [string, string]; guestName: string; onDone: () => void }) {
  const [groom, bride] = couple;
  const names: Record<number, string> = { [LANE_GROOM]: groom, [LANE_GUEST]: guestName, [LANE_BRIDE]: bride };

  const [lit, setLit] = useState<number[]>([]);
  const [dim, setDim] = useState(false);
  const [announce, setAnnounce] = useState<{ lane: number; top: number } | null>(null);

  const root = useRef<HTMLElement>(null);
  const title = useRef<HTMLParagraphElement>(null);
  const fly = useRef<HTMLDivElement>(null);
  const slots = useRef<Record<number, HTMLDivElement | null>>({});
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const t = createTimeline();
    const reduce = prefersReducedMotion();

    /** レーンの名前がはみ出すなら、収まるまで文字を小さくする */
    function fit(lane: number) {
      const slot = slots.current[lane];
      if (!slot) return;
      slot.style.fontSize = `${LANE_FONT_PX}px`;
      if (slot.scrollWidth > slot.clientWidth && slot.scrollWidth > 0) {
        slot.style.fontSize = `${Math.max(LANE_FONT_MIN_PX, Math.floor((LANE_FONT_PX * slot.clientWidth) / slot.scrollWidth))}px`;
      }
    }

    async function show(lane: number, isGuest: boolean) {
      const slot = slots.current[lane];
      const stage = root.current;
      const el = fly.current;
      if (!slot || !stage || !el) return;
      const hold = isGuest ? OPENING_TIMING.nameHoldGuest : OPENING_TIMING.nameHoldCouple;
      const st = stage.getBoundingClientRect();
      const boardTop = (title.current?.getBoundingClientRect().top ?? ANNOUNCE_AREA_PX) - st.top;
      const centerY = Math.max(90, boardTop / 2 + 20);

      if (reduce) {
        // 動きを減らす設定: 拡大して飛ばさず、レーンにそのまま出す
        setAnnounce({ lane, top: centerY - 12 });
        setLit((l) => [...l, lane]);
        await t.sleep(OPENING_TIMING.nameFadeIn + hold);
        setAnnounce(null);
        await t.sleep(isGuest ? 0 : OPENING_TIMING.afterSettleCouple);
        return;
      }

      /*
        ★飛ぶ名前は、最初から大きい文字で描き、縮めるだけにする★（Issue #267）
          以前はレーンの文字と同じ大きさで描いて scale で拡大し、それを scale(1) へ縮めていた。途中で文字が毎フレーム
          描き直され、字の位置が細かく揺れて「ずずっと」ずれて見えた。大きい文字（fontPx × 倍率）を1枚の層に固定し
          （will-change・backface-visibility）、scale(1 / 倍率) へ縮める動きだけにすると、描き直しが起きない。
        ★縮みきった姿をレーンの文字に合わせる★ 大きさはレーンの文字（fit() で決めた Math.floor の値）から計算し、
          書体・太さ（font-bold）・字間（指定なし）を同じにする。左上を軸に縮めるので、縮みきると左上がレーンの文字の位置に来る。
      */
      const target = slot.getBoundingClientRect();
      const fontPx = parseFloat(getComputedStyle(slot).fontSize) || LANE_FONT_PX;
      const h = fontPx * LINE;
      const left = target.left - st.left;
      const top = target.top - st.top + (target.height - h) / 2;
      el.textContent = names[lane];
      el.style.lineHeight = String(LINE);
      el.style.color = isGuest ? OPENING_COLORS.led : OPENING_COLORS.ink;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.transform = "none";
      // まずレーンと同じ大きさで幅を測り、画面の幅に収まる倍率を決める
      el.style.fontSize = `${fontPx}px`;
      const w = el.getBoundingClientRect().width || 1;
      const scale = Math.min(NAME_SCALE_MAX, (st.width - NAME_SIDE_MARGIN_PX * 2) / w);
      // 大きい文字で描き直す（ここから先は大きさを変えない）
      el.style.fontSize = `${fontPx * scale}px`;
      const bigW = el.getBoundingClientRect().width || w * scale;
      const bigH = h * scale;

      // 表の上の空きの中央に大きく出す（縮めない＝等倍）。縮みきった姿は scale(1 / 倍率)
      const cx = st.width / 2 - left - bigW / 2;
      const cy = centerY - top - bigH / 2;
      const big = `translate(${cx}px, ${cy}px) scale(1)`;
      const small = `translate(0px, 0px) scale(${1 / scale})`;

      setAnnounce({ lane, top: centerY - bigH / 2 - 30 });
      setDim(true);
      el.style.opacity = "1";
      await t.play(el, [{ transform: big, opacity: 0 }, { transform: big, opacity: 1 }], { duration: OPENING_TIMING.nameFadeIn, fill: "forwards" });
      await t.sleep(hold);
      setAnnounce(null);
      setDim(false);
      await t.play(el, [{ transform: big }, { transform: small }], {
        duration: OPENING_TIMING.nameSettle,
        easing: "cubic-bezier(.5,0,.2,1)",
        fill: "forwards",
      });
      // ★入れ替えは、レーンの文字を出してから★ 描かれたのを確かめて（2フレーム待って）飛ぶ名前を消す（一瞬の空白を出さない）
      setLit((l) => [...l, lane]);
      await nextPaint();
      el.style.opacity = "0";
      el.getAnimations().forEach((a) => a.cancel());
      await t.sleep(isGuest ? 0 : OPENING_TIMING.afterSettleCouple);
    }

    void (async () => {
      for (const lane of [LANE_GROOM, LANE_GUEST, LANE_BRIDE]) fit(lane);
      await t.play(root.current, [{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(500, OPENING_TIMING.laneEnter), fill: "forwards" });
      await t.sleep(Math.max(0, OPENING_TIMING.laneEnter - 500));
      await show(LANE_GROOM, false);
      await show(LANE_BRIDE, false);
      await show(LANE_GUEST, true);
      await t.sleep(OPENING_TIMING.afterSettleGuest);
      await t.play(root.current, [{ opacity: 1 }, { opacity: 0 }], { duration: OPENING_TIMING.laneExit, fill: "forwards" });
      done.current();
    })();
    return () => t.cancel();
    // 名前は場面の途中で変わらない（変わるときは親が key で作り直す）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      ref={root}
      className="absolute inset-0 flex flex-col justify-center px-[22px] pb-6 opacity-0"
      style={{ background: "#000", color: OPENING_COLORS.ink, paddingTop: ANNOUNCE_AREA_PX }}
    >
      <p className="sr-only">{`レーンの発表。${LANE_GROOM}レーン ${groom}、${LANE_BRIDE}レーン ${bride}、${LANE_GUEST}レーン ${guestName}`}</p>
      <p ref={title} aria-hidden className="mb-3.5 text-center text-[11px] tracking-[0.35em]" style={{ color: OPENING_COLORS.dim }}>
        LANE ASSIGNMENT
      </p>
      <div aria-hidden className="transition-opacity duration-300" style={{ opacity: dim ? 0.25 : 1 }}>
        {LANES.map((n) => {
          const on = lit.includes(n);
          const guest = n === LANE_GUEST;
          return (
            <div
              key={n}
              className="flex items-center transition-colors duration-300"
              style={{
                // 背の低い画面でも8レーンが収まるようにする
                height: `min(44px, calc((100dvh - ${ANNOUNCE_AREA_PX + 70}px) / ${LANE_COUNT}))`,
                borderTop: `1px solid ${OPENING_COLORS.laneLine}`,
                borderBottom: n === LANE_COUNT ? `1px solid ${OPENING_COLORS.laneLine}` : undefined,
                background: on && guest ? "rgba(255,154,60,0.07)" : "transparent",
              }}
            >
              <div className="w-11 shrink-0 text-lg transition-colors duration-300" style={{ fontFamily: MONO, color: on ? OPENING_COLORS.led : OPENING_COLORS.laneNo }}>
                {n}
              </div>
              <div
                ref={(el) => {
                  slots.current[n] = el;
                }}
                className="min-w-0 flex-1 overflow-hidden whitespace-nowrap font-bold"
                style={{ fontSize: LANE_FONT_PX, opacity: on ? 1 : 0, color: guest ? OPENING_COLORS.led : OPENING_COLORS.ink }}
              >
                {names[n] ?? ""}
              </div>
            </div>
          );
        })}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 text-center text-[15px] tracking-[0.3em] transition-opacity duration-200"
        style={{ top: announce?.top ?? 0, opacity: announce ? 1 : 0, color: OPENING_COLORS.led, fontFamily: MONO }}
      >
        {announce ? `${announce.lane} レーン` : ""}
      </div>
      {/* ★太さはレーンの文字と同じ font-bold★（以前は font-extrabold で、収まる瞬間に字の幅が変わってずれた） */}
      <div
        ref={fly}
        aria-hidden
        className="pointer-events-none absolute origin-top-left whitespace-nowrap font-bold opacity-0"
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
      />
    </section>
  );
}

/** 次の描画が済むまで待つ（React の更新が画面に出てから次へ進むため。2フレーム） */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
