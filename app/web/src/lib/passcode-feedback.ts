import { PASSCODE_HINT_FROM_DEFAULT, PASSCODE_MAX_ATTEMPTS, PASSCODE_WARN_REMAINING } from "@/config/passcode";

/**
 * パスコードを間違えたときに、エラーの下に出すもの（Issue #181）。
 * サーバー（api/guest/passcode）が間違いの応答に入れて返し、画面（PasscodeStep）が出す。
 * /admin/invitation_test は同じ形をテスト画面の中で組み立てる。
 */
export type PasscodeFeedback = {
  /** ヒントの文言（「ヒント：」は画面が付ける）。まだ出さない・未設定なら null */
  hint: string | null;
  /** ロックまでの残りの回数。PASSCODE_WARN_REMAINING より多ければ null（出さない） */
  remaining: number | null;
  /** 次のロックが一時（PASSCODE_LOCK_MINUTES 分）か、永久（受付の停止）か */
  nextLock: "temporary" | "permanent";
};

/** 間違えたときに投げる。feedback があれば、エラーの下にヒントと残りの回数を出す */
export class PasscodeError extends Error {
  constructor(message: string, readonly feedback: PasscodeFeedback | null = null) {
    super(message);
    this.name = "PasscodeError";
  }
}

/**
 * wrongCount 回目の間違いのあとに出すものを組み立てる。
 * ヒントは config/invitation の passcodeHint・passcodeHintFrom から（未設定ならヒントなし）。
 */
export function passcodeFeedback(
  wrongCount: number,
  config: { passcodeHint?: string; passcodeHintFrom?: number } | null,
  nextLock: PasscodeFeedback["nextLock"],
): PasscodeFeedback {
  const from = config?.passcodeHintFrom ?? PASSCODE_HINT_FROM_DEFAULT;
  const hint = config?.passcodeHint && wrongCount >= from ? config.passcodeHint : null;
  const left = PASSCODE_MAX_ATTEMPTS - wrongCount;
  return { hint, remaining: left > 0 && left <= PASSCODE_WARN_REMAINING ? left : null, nextLock };
}

/** API の応答から取り出す。形が違えば null（エラーの文言だけを出す） */
export function parsePasscodeFeedback(data: unknown): PasscodeFeedback | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const f = d.feedback as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object") return null;
  return {
    hint: typeof f.hint === "string" && f.hint ? f.hint : null,
    remaining: typeof f.remaining === "number" && f.remaining > 0 ? f.remaining : null,
    nextLock: f.nextLock === "permanent" ? "permanent" : "temporary",
  };
}
