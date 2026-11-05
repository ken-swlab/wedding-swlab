"use client";

import { useEffect, useRef, useState } from "react";
import { OPENING_COLORS, OPENING_TIMING, REACTION_MAX_MS, REACTION_MIN_MS } from "@/config/opening";
import { createTimeline, prefersReducedMotion } from "./timeline";

/**
 * 長押しの状態。
 *   ready    … 「長押しで構える」を出して待っている（Take your marks は薄いグレーで置いておく）
 *   stance   … 指を置いた直後。「離す合図」の案内を releaseGuide のあいだ出し、消してから afterGuide の余白を置く
 *              （ここで離したら静かに ready へ戻す）
 *   holding  … 構えた。Take your marks を1語ずつグレー → 白に変え、marks のあとランダムな間を待つ（ここで離すとフライング）
 *   starting … START を出すと決めた〜その絵が描かれるフレームまで（ここで離してもフライング）
 *   started  … START が描かれた（ここで離した時刻がリアクションタイム）
 *   foul     … 「フライング！」を出している
 *   done     … 結果が決まった
 */
type Hold = "ready" | "stance" | "holding" | "starting" | "started" | "foul" | "done";

const WORDS = ["Take", "your", "marks"] as const;

/**
 * 3〜4. 長押しで構える → 「離す合図」の案内 → Take your marks → START で指を離す。離すまでの時間がリアクションタイム。
 *
 * ★押す前は「長押しで構える」だけを出す★（Issue #192）押す前に「離す」まで覚えてもらうのは難しいので、
 *   離す合図は構えたあとに文字だけで案内する。画面を光らせる見本は出さない（見本につられて離し、フライングになる）。
 *   案内はフライングのあとも毎回出す。
 *
 * ★計測★ 基準は「START が描かれたフレームの時刻」（requestAnimationFrame の timestamp）、
 *   終わりは pointerup の event.timeStamp。どちらもページを開いてからの同じ時計（performance.now と同じ）。
 * ★START までの残り時間を示すものを出さない★（進捗バーなど）。合図が読めてしまう。
 *   待つ時間は毎回ランダム（startDelayMin〜startDelayMax）。
 * ★判定★
 *   案内中・案内のあとの余白（stance）に離した → フライングにせず、静かに「長押しで構える」に戻す
 *   Take your marks 〜 START の前に離した → フライング（「長押しで構える」からやり直し）
 *   START から REACTION_MIN_MS 未満で離した → 合図を予測した反応とみなしてフライング（やり直し）
 *   START から noReaction のあいだ離さない → 反応なし（記録せずに先へ進む）
 * ★長押しで iOS の選択・コピーのメニューを出さない★ 親（Opening）の舞台が user-select / touch-callout /
 *   contextmenu を止めている。ここでは pointerdown を preventDefault する。
 * ★タッチはネイティブのイベントで聞く★ passive でない pointerdown が要る（preventDefault するため）。
 *
 * ★marks を出し終えてから START までの間を数える★ marks より先に START が出ないようにする。
 *
 * ★Take your marks は押す前から薄いグレーで置いておく★（Issue #211）長押しの前に「このあとスタートが来る」と分かるように。
 *   ready に入るときに 400ms でフェードインし、holding で今と同じ間のまま1語ずつ白くする。フライングで ready に戻ると3語ともグレーに戻す。
 *   グレーでも白でも START までの残り時間は示さない（白くなる間は毎回同じで、START までの間は marks のあとにランダムで数える）。
 *   グレーは text-white/15（主張しすぎないよう、25 から下げた）。案内（stance）の間は、案内の文字と重ならないよう
 *   text-white/10 まで薄くする（iPhone SE など背の低い画面で重なる）。
 *
 * ★止まったままにしない★（Issue #157 A-2）「長押しで構える」を出してから一度も指を置かないまま idleEmphasis（5 秒）で
 *   丸と案内を大きくし、idleSkip（10 秒）で「スキップして招待状へ」を下に大きめに出す（右上のスキップと同じ）。
 *
 * onResult: 有効なタイム（ms の整数）か、反応なしの null。1回だけ呼ぶ。
 * onSkip: 「スキップして招待状へ」。
 */
export function StartScene({ onResult, onSkip }: { onResult: (reactionMs: number | null) => void; onSkip: () => void }) {
  // 白くなった語の数（0〜3）。白くなっていない語は薄いグレー
  const [words, setWords] = useState(0);
  // Take your marks を出したか（最初の ready でフェードインする）
  const [marksShown, setMarksShown] = useState(false);
  const [hint, setHint] = useState(false);
  const [guide, setGuide] = useState(false);
  const [tense, setTense] = useState(false);
  const [markHidden, setMarkHidden] = useState(false);
  const [foul, setFoul] = useState<string | null>(null);
  // 0: ふつう → 1: 案内を大きく → 2: スキップを大きく出す（一度も指を置かないまま待っているとき）
  const [idle, setIdle] = useState<0 | 1 | 2>(0);

  const root = useRef<HTMLElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const startText = useRef<HTMLDivElement>(null);
  const result = useRef(onResult);
  useEffect(() => {
    result.current = onResult;
  }, [onResult]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const t = createTimeline();
    const reduce = prefersReducedMotion();

    let hold: Hold = "ready";
    let pointer: number | null = null;
    // 案内 → Take → your → marks → START の、いま待っている1つ（離したら取り消す）
    let stepTimer: ReturnType<typeof setTimeout> | null = null;
    let noReactionTimer: ReturnType<typeof setTimeout> | null = null;
    let idleTimers: ReturnType<typeof setTimeout>[] | null = null;
    let touched = false;
    let frame = 0;
    let startAt = 0;

    function clearTimers() {
      t.clear(stepTimer);
      t.clear(noReactionTimer);
      stepTimer = noReactionTimer = null;
      cancelAnimationFrame(frame);
    }

    function ready() {
      hold = "ready";
      pointer = null;
      setGuide(false);
      setWords(0);
      setMarkHidden(false);
      setMarksShown(true);
      setHint(true);
      // 初めて案内を出したときだけ、待ち続けている人への案内を仕込む
      if (!touched && !idleTimers) {
        idleTimers = [t.after(OPENING_TIMING.idleEmphasis, () => setIdle(1)), t.after(OPENING_TIMING.idleSkip, () => setIdle(2))];
      }
    }

    function finish(reactionMs: number | null) {
      clearTimers();
      hold = "done";
      setTense(false);
      result.current(reactionMs);
    }

    function flying(message: string) {
      clearTimers();
      hold = "foul";
      pointer = null;
      setTense(false);
      setFoul(message);
      t.after(OPENING_TIMING.foulShow, () => {
        setFoul(null);
        ready();
      });
    }

    // 構えた: Take → your → marks を出し、出し終えてからランダムな間で START
    function marks() {
      hold = "holding";
      setGuide(false);
      setTense(true);
      setWords(1);
      stepTimer = t.after(OPENING_TIMING.afterTake, () => {
        setWords(2);
        stepTimer = t.after(OPENING_TIMING.afterYour, () => {
          setWords(3);
          const delay = OPENING_TIMING.startDelayMin + Math.random() * (OPENING_TIMING.startDelayMax - OPENING_TIMING.startDelayMin);
          stepTimer = t.after(delay, go);
        });
      });
    }

    function go() {
      hold = "starting";
      setMarkHidden(true);
      // 画面が白く光り「START」（音は使わない）
      flash.current?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: OPENING_TIMING.startFlash });
      startText.current?.animate(
        reduce
          ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }]
          : [{ opacity: 0, transform: "scale(1.4)" }, { opacity: 1, transform: "scale(1)", offset: 0.2 }, { opacity: 0, transform: "scale(1)" }],
        { duration: OPENING_TIMING.startFlash },
      );
      // ★START が描かれるフレームの時刻を基準にする★
      frame = requestAnimationFrame((ts) => {
        startAt = ts;
        if (hold === "starting") hold = "started";
      });
      noReactionTimer = t.after(OPENING_TIMING.noReaction, () => {
        if (hold === "started") finish(null);
      });
    }

    function onDown(e: PointerEvent) {
      if (hold !== "ready" || (e.target instanceof Element && e.target.closest("button"))) return;
      e.preventDefault();
      if (!touched) {
        touched = true;
        idleTimers?.forEach((h) => t.clear(h));
        setIdle(0);
      }
      hold = "stance";
      pointer = e.pointerId;
      setHint(false);
      setGuide(true);
      // 案内を消す → 余白（afterGuide）→ Take your marks。余白のあいだも stance のまま
      stepTimer = t.after(OPENING_TIMING.releaseGuide, () => {
        if (hold !== "stance") return;
        setGuide(false);
        stepTimer = t.after(OPENING_TIMING.afterGuide, () => {
          if (hold === "stance") marks();
        });
      });
    }

    function onUp(e: PointerEvent) {
      // 構えた指だけを見る（2本目の指の上げ下げは無視する）
      if (pointer !== null && e.pointerId !== pointer) return;
      if (hold === "stance") {
        clearTimers();
        ready();
        return;
      }
      if (hold === "holding" || hold === "starting") {
        flying("もう一度、長押しで構える");
        return;
      }
      if (hold !== "started") return;
      const at = e.timeStamp > 0 ? e.timeStamp : performance.now();
      const elapsed = at - startAt;
      if (elapsed < REACTION_MIN_MS) {
        flying("合図を予測した反応（0.10秒未満）はフライングです");
        return;
      }
      // 保存はミリ秒の整数（表示は 1/100 秒・切り捨て。lib/opening-names.ts の formatReaction）
      finish(Math.min(REACTION_MAX_MS, Math.floor(elapsed)));
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    ready();

    return () => {
      t.cancel();
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <section ref={root} className="absolute inset-0" style={{ background: "#000", color: OPENING_COLORS.ink }}>
      {/* 構えると画面が少し寄る */}
      <div className="absolute inset-0 transition-transform duration-[1200ms] ease-out motion-reduce:transition-none" style={{ transform: tense ? "scale(1.04)" : "scale(1)" }}>
        {/* 押す前から薄いグレーで置き、構えたら1語ずつ白くする（Issue #211）。案内の間はさらに薄く */}
        <p
          // ★背の低い画面では案内の上に収める★（Issue #230）36% のままだと、高さ 550〜570px で中央の案内（約 105px）と重なった。
          //   50% − 110px（案内の上半分 53px ＋ この行の高さ 45px ＋ すき間 12px）より下にしない
          // ★行の高さに余裕を持たせ、下に少し余白★（Issue #262。y の下（ディセンダー）を、箱の中に収める）
          // ★案内（画面が白く光り…）より上に描く（z-10）・案内とのすき間を広くとる（50% − 130px）★
          //   案内の箱は、見えていない間（opacity 0）も同じ場所にある。iPhone の LINE では、Take your marks の行と
          //   すき間が小さい（8〜20px）と、重なった所で「y」の下が切れたり、色が描き直されずに残ったりした（実機で確認）。
          //   上に描けば、多少重なっても欠けない。フライングの箱（下の role="alert"）は、この行の位置から決める
          className="absolute inset-x-0 top-[min(36%,calc(50%-130px))] z-10 pb-1 text-center text-[30px] font-extrabold leading-[1.3] tracking-[0.06em] transition-opacity duration-[400ms]"
          style={{ visibility: markHidden ? "hidden" : "visible", opacity: marksShown ? 1 : 0 }}
        >
          {WORDS.map((w, i) => (
            <span key={w} className={`transition-colors duration-100 ${words > i ? "" : guide ? "text-white/10" : "text-white/15"}`}>
              {w}
              {i < WORDS.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
        <div className="absolute inset-x-0 bottom-[14%] flex flex-col items-center gap-3 transition-opacity duration-300" style={{ opacity: hint ? 1 : 0 }}>
          {/* 指は丸の外へはみ出す（overflow は visible のまま）。放置で丸ごと大きくし、指・波紋も一緒に大きくなる */}
          <span
            aria-hidden
            className={`relative block h-16 w-16 overflow-visible rounded-full border-2 border-white/70 transition-transform duration-500 motion-reduce:transition-none ${idle >= 1 ? "start-idle-pulse scale-125" : ""}`}
          >
            <span className="start-hand-press absolute inset-[14px] rounded-full bg-white/85" />
            <span className="start-hand-ripple" />
            <PressHand />
          </span>
          <p className={`tracking-[0.1em] text-white/90 transition-[font-size] ${idle >= 1 ? "mt-2 text-[length:calc(1.125rem*var(--inv-scale))] font-bold" : "text-[length:calc(0.875rem*var(--inv-scale))]"}`}>長押しで構える</p>
        </div>
        {/* 離す合図の案内（Issue #192）。文字だけ。光らせる見本は出さない
            ★一番大事な指示なので大きく出す★（Issue #201。黒の地で 16px は目に入りにくかった）
            ★「START」は合図で出る START（下の startText）と同じ太さ・字間にする★「この文字が出たら」と一致させるため。
            改行は文の切れ目に手で入れる（iOS の Safari は word-break: auto-phrase に未対応）。幅 320px の画面でも3行に収まる
            ★横の余白は inset-x-4★ 親族用の大きさでも、幅 320px で3行に収める（中央ぞろえなので友人用の見た目は変わらない）
            ★「長押しで構える」とこの案内だけは、親族用の倍率（--inv-scale。Issue #240）に従う★ ほかの黒い画面の文字はそのまま */}
        <p
          className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-[length:calc(19px*var(--inv-scale))] leading-[1.7] tracking-[0.06em] text-white transition-opacity duration-200"
          style={{ opacity: guide ? 1 : 0 }}
        >
          画面が白く光り
          <br />
          <b className="text-[length:calc(24px*var(--inv-scale))] font-black tracking-[0.08em]">START</b> と出たら、
          <br />
          素早く指を離してください
        </p>
        {idle >= 2 && (
          <div className="welcome-fade-in absolute inset-x-6 flex justify-center" style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
            <button
              type="button"
              onClick={onSkip}
              className="min-h-12 w-full max-w-[20rem] touch-manipulation rounded-full border border-white/40 bg-white/15 px-6 text-[15px] font-medium text-white"
            >
              スキップして招待状へ
            </button>
          </div>
        )}
      </div>

      <div ref={flash} aria-hidden className="pointer-events-none absolute inset-0 z-20 bg-white opacity-0" />
      <div ref={startText} aria-hidden className="pointer-events-none absolute inset-0 z-[21] flex items-center justify-center text-[64px] font-black tracking-[0.08em] text-black opacity-0">
        START
      </div>
      {/*
        ★フライングの箱は Take your marks の下に置く★（Issue #262）
          以前は top-[38%] で、画面の高さによっては Take your marks の行の下 4〜9px に重なり、
          フライングのあと「y」の下が黒い帯（bg-black/80）で切られて見えた（iPhone 13 mini・SE で再現）。
          Take your marks の行の上端（min(36%, 50%−130px)）から、行の高さ（約 43px）＋すき間の分だけ下げる。
      */}
      <div
        role="alert"
        className="pointer-events-none absolute inset-x-6 top-[calc(min(36%,calc(50%-130px))+60px)] z-[22] rounded-2xl bg-black/80 py-[18px] text-center text-[34px] font-black transition-opacity duration-200"
        style={{ opacity: foul ? 1 : 0, color: OPENING_COLORS.led }}
      >
        {foul && (
          <>
            フライング！
            <small className="mt-2 block px-3 text-[13px] font-medium tracking-[0.1em] text-white/80">{foul}</small>
          </>
        )}
      </div>
    </section>
  );
}

/** 長押しの指（塗り。Issue #192）。丸（h-16 w-16）の中に absolute で重ねる */
function PressHand() {
  return (
    <svg aria-hidden viewBox="0 0 40 52" className="start-hand pointer-events-none absolute" style={{ width: 34, height: 44, left: 30, top: 28 }}>
      <path
        d="M13 6a4 4 0 0 1 8 0v17l2-.6a4 4 0 0 1 3 .2l6.5 3.1A6 6 0 0 1 36 31.4V40a10 10 0 0 1-10 10h-6.5a8 8 0 0 1-6.3-3.1L5.4 37a3.6 3.6 0 0 1 5.4-4.7L13 34.5z"
        fill="rgba(255,255,255,.92)"
      />
    </svg>
  );
}
