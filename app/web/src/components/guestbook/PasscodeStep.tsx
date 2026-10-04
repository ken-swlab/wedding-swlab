"use client";

import { useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/api-client";
import { PASSCODE_LENGTH } from "@/config/passcode";

/**
 * 招待状の前に出す4桁のパスコード入力。
 * 最後の桁を入れた瞬間に送信する（ボタンは置かない）。
 *
 * ★本物の input を数字の枠の上に重ねる★
 *   iOS はタップ（ユーザー操作）で focus しないとキーボードを出さない。
 *   見えない input を枠の全面に重ねておけば、どこをタップしても
 *   そのまま input が focus され、テンキーが出る。
 *   font-size を 16px 未満にすると iOS が画面を拡大するので 16px にしている。
 */
export function PasscodeStep({ onCleared }: { onCleared: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Android などではこれだけでキーボードが出る。iOS は枠をタップしてもらう
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(code: string) {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/guest/passcode", { passcode: code });
      onCleared();
    } catch (e) {
      const message = e instanceof Error ? e.message : "確認できませんでした。もう一度お試しください";
      // サーバーはロック時に「上限」を含む文言を返す（api/guest/passcode）
      const isLocked = message.includes("上限");
      setError(message);
      setLocked(isLocked);
      setValue("");
      setShakeKey((k) => k + 1);
      if (!isLocked) inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function onChange(raw: string) {
    // ★全角数字も受け付ける★ IME が全角のままでも見た目どおりに通す
    const digits = raw.normalize("NFKC").replace(/\D/g, "").slice(0, PASSCODE_LENGTH);
    setValue(digits);
    if (digits.length > 0) setError(null);
    if (digits.length === PASSCODE_LENGTH && !busy && !locked) void submit(digits);
  }

  const disabled = busy || locked;

  return (
    <section className="invitation-rise text-center">
      <p className="text-[11px] tracking-[0.35em] text-stone-400">PASSCODE</p>
      <h2 className="mt-3 font-serif text-xl text-stone-800">パスコードをご入力ください</h2>
      <p className="mt-3 text-[13px] leading-relaxed text-stone-500">
        LINE でお送りした {PASSCODE_LENGTH} 桁の数字です。
        <br />
        最後の数字を入れると、そのまま招待状が開きます。
      </p>

      <div key={shakeKey} className={`relative mx-auto mt-8 w-fit ${shakeKey > 0 ? "passcode-shake" : ""}`}>
        <div className="flex gap-3" aria-hidden="true">
          {Array.from({ length: PASSCODE_LENGTH }, (_, i) => {
            const filled = i < value.length;
            const current = i === value.length && !disabled;
            return (
              <div
                key={i}
                className={`flex h-16 w-14 items-center justify-center rounded-2xl border bg-white font-serif text-2xl text-stone-800 shadow-sm transition ${
                  error ? "border-rose-300" : current ? "border-stone-500" : filled ? "border-stone-300" : "border-stone-200"
                } ${busy ? "animate-pulse" : ""}`}
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

      <div className="mt-6 min-h-[4.5rem]" aria-live="polite">
        {busy && <p className="text-[13px] text-stone-500">確認しています…</p>}
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
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
        お困りのときは、新郎新婦へ LINE でお気軽にご連絡ください。
      </p>
    </section>
  );
}
