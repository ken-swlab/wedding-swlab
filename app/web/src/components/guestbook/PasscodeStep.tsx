"use client";

import { useEffect, useRef, useState } from "react";
import { PASSCODE_LENGTH, PASSCODE_LOCK_MINUTES } from "@/config/passcode";
import { PasscodeError, type PasscodeFeedback } from "@/lib/passcode-feedback";
import { CALL_LINE_Y, OPENING_COLORS, OPENING_TIMING } from "@/config/opening";
import { createTimeline, prefersReducedMotion, type Timeline } from "@/components/opening/timeline";

/**
 * 招待状の前に出す4桁のパスコード入力。
 * 最後の桁を入れた瞬間に送信する（ボタンは置かない）。
 *
 * ★本物の input を数字の枠の上に重ねる★
 *   iOS はタップ（ユーザー操作）で focus しないとキーボードを出さない。
 *   見えない input を枠の全面に重ねておけば、どこをタップしても
 *   そのまま input が focus され、テンキーが出る。
 *   font-size を 16px 未満にすると iOS が画面を拡大するので 16px にしている。
 *
 * 送信の処理（API の呼び出し）は onSubmit で受け取る。通らなければ Error を投げ、
 * その message を画面に出す（/admin/invitation_test はダミーを渡す）。
 * PasscodeError に feedback があれば、エラーの下にヒントと「あと◯回」を出す（Issue #181。揺れる動きはそのまま）。
 *
 * ★通ったら、4つの枠を1本の線に縮め、その線を招集の区切り線の位置（CALL_LINE_Y）へ運んでから onCleared★（Issue #165）
 *   次のオープニング（CallScene の intro="passcode"）は、同じ位置の線から始まる。地の色も同じ（OPENING_COLORS.calm）なので、
 *   画面が入れ替わっても「枠 → 線 → 区切り線」がつながって見える。
 *   「確認しています…」は API の応答と passcodeCheckMin のうち長いほうまで出す。onSubmit はそのあいだに次の画面の
 *   中身まで読み込んでおき、onCleared で画面を切り替える（読み込み中の画面を挟まない）。
 *   動きを減らす設定では、線を運ばずに onCleared（オープニングはフェードで始まる）。
 */
export function PasscodeStep({ onSubmit, onCleared }: { onSubmit: (passcode: string) => Promise<void>; onCleared: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<PasscodeFeedback | null>(null);
  const [locked, setLocked] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [cleared, setCleared] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxesRef = useRef<HTMLDivElement>(null);
  const timeline = useRef<Timeline | null>(null);
  const clearedRef = useRef(onCleared);
  useEffect(() => {
    clearedRef.current = onCleared;
  }, [onCleared]);
  useEffect(() => () => timeline.current?.cancel(), []);

  // Android などではこれだけでキーボードが出る。iOS は枠をタップしてもらう
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(code: string) {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await Promise.all([onSubmit(code), new Promise((r) => setTimeout(r, OPENING_TIMING.passcodeCheckMin))]);
      await collapse();
      return;
    } catch (e) {
      const message = e instanceof Error ? e.message : "確認できませんでした。もう一度お試しください";
      // サーバーはロック時に「上限」を含む文言を返す（api/guest/passcode）
      const isLocked = message.includes("上限");
      setError(message);
      // ロックされたときは、ロックの文言（既存）だけを出す
      setFeedback(!isLocked && e instanceof PasscodeError ? e.feedback : null);
      setLocked(isLocked);
      setValue("");
      setShakeKey((k) => k + 1);
      if (!isLocked) inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  /** 枠を線に縮めて、区切り線の位置へ運ぶ。終わったら onCleared */
  async function collapse() {
    const t = createTimeline();
    timeline.current = t;
    inputRef.current?.blur();
    setCleared(true);
    if (prefersReducedMotion()) {
      clearedRef.current();
      return;
    }
    await t.sleep(OPENING_TIMING.boxesCollapse);
    const el = boxesRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const dy = window.innerHeight * CALL_LINE_Y - (r.top + r.height / 2);
      await t.play(el, [{ transform: "translateY(0)" }, { transform: `translateY(${dy}px)` }], {
        duration: OPENING_TIMING.lineMove,
        easing: "cubic-bezier(.6,0,.2,1)",
        fill: "forwards",
      });
    }
    clearedRef.current();
  }

  function onChange(raw: string) {
    // ★全角数字も受け付ける★ IME が全角のままでも見た目どおりに通す
    const digits = raw.normalize("NFKC").replace(/\D/g, "").slice(0, PASSCODE_LENGTH);
    setValue(digits);
    if (digits.length > 0) setError(null);
    if (digits.length === PASSCODE_LENGTH && !busy && !locked) void submit(digits);
  }

  const disabled = busy || locked || cleared;
  // 枠が線に縮んだあとは、見出し・案内を消す（opacity だけを動かす）
  const fade = `transition-opacity duration-[450ms] ${cleared ? "opacity-0" : "opacity-100"}`;

  return (
    <section className="invitation-rise text-center">
      <div className={fade}>
      <p className="text-[11px] tracking-[0.35em] text-stone-500">PASSCODE</p>
      <h2 className="mt-3 font-serif text-xl text-stone-800">パスコードをご入力ください</h2>
      <p className="mt-3 text-[13px] leading-relaxed text-stone-500">
        LINE でお送りした {PASSCODE_LENGTH} 桁の数字です。
        <br />
        最後の数字を入れると、そのまま招待状が開きます。
      </p>
      </div>

      <div key={shakeKey} ref={boxesRef} className={`relative mx-auto mt-8 w-fit ${shakeKey > 0 ? "passcode-shake" : ""}`}>
        <div className="flex h-16 items-center gap-3" aria-hidden="true">
          {Array.from({ length: PASSCODE_LENGTH }, (_, i) => {
            const filled = i < value.length;
            const current = i === value.length && !disabled;
            // ★縮んだ枠は幅 30px・高さ 1px・左右 -6px★ 4本がすき間なくつながり、幅 120px の1本の線になる
            //   （CallScene の区切り線と同じ幅・色）
            return (
              <div
                key={i}
                className={`flex items-center justify-center font-serif text-2xl transition-all duration-[550ms] ease-[cubic-bezier(.6,0,.2,1)] ${
                  cleared
                    ? "mx-[-6px] h-px w-[30px] rounded-none border-0 text-transparent"
                    : `h-16 w-14 rounded-2xl border bg-white text-stone-800 shadow-sm ${
                        error ? "border-rose-300" : current ? "border-stone-500" : filled ? "border-stone-300" : "border-stone-200"
                      } ${busy ? "animate-pulse" : ""}`
                }`}
                style={cleared ? { background: OPENING_COLORS.calmInk, opacity: 0.45 } : undefined}
              >
                {value[i] ?? ""}
              </div>
            );
          })}
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={`パスコード（${PASSCODE_LENGTH}桁の数字）`}
          aria-invalid={error !== null}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={PASSCODE_LENGTH * 2}
          className="absolute inset-0 h-full w-full touch-manipulation cursor-pointer text-[16px] text-transparent caret-transparent opacity-0 disabled:cursor-default"
        />
      </div>

      <div className={`mt-6 min-h-[4.5rem] ${fade}`} aria-live="polite">
        {(busy || cleared) && <p className="text-[13px] text-stone-500">確認しています…</p>}
        {error && (
          <p
            role="alert"
            className={`mx-auto max-w-[20rem] rounded-xl px-4 py-3 text-[13px] leading-relaxed ${
              locked ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"
            }`}
          >
            {error}
          </p>
        )}
        {/* ★ヒントは打ち直している間も残す★ エラーは1桁めで消えるが、ヒントは次に送るまで見えていてほしい */}
        {feedback && (feedback.hint || feedback.remaining != null) && (
          <div className="mx-auto mt-2 max-w-[20rem] text-[13px] leading-relaxed text-stone-600">
            {feedback.hint && <p>ヒント：{feedback.hint}</p>}
            {feedback.remaining != null && (
              <p className="mt-1 text-[12px] text-stone-500">
                {feedback.nextLock === "permanent"
                  ? `あと${feedback.remaining}回まちがえると、受付を停止します`
                  : `あと${feedback.remaining}回まちがえると、${PASSCODE_LOCK_MINUTES}分お待ちいただきます`}
              </p>
            )}
          </div>
        )}
      </div>

      <p className={`mt-2 text-[11px] leading-relaxed text-stone-500 ${fade}`}>
        お困りのときは、新郎新婦へ LINE でお気軽にご連絡ください。
      </p>
    </section>
  );
}
