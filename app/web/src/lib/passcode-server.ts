import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { PASSCODE_LENGTH } from "@/config/passcode";

/**
 * パスコードの正規化。
 *
 * ★NFKC が必須★
 *   日本語 IME では全角数字（１１０８）が普通に入力される。
 *   正規化しないと当日「合っているのに通らない」問い合わせが必ず出る。
 *   スペースとハイフン類も落として、見た目どおりに通るようにする。
 */
export function normalizePasscode(s: string): string {
  return s.normalize("NFKC").replace(/[\s\-‐−ー―]/g, "").trim();
}

/**
 * 正しいパスコード。未設定、または桁数が PASSCODE_LENGTH と違うときは null。
 * 理由はサーバーログにだけ残す（環境変数名をクライアントに出さない）。
 */
export function expectedPasscode(): string | null {
  const v = normalizePasscode(process.env.WEDDING_PASSCODE ?? "");
  if (!v) {
    console.error("[passcode] WEDDING_PASSCODE が未設定です");
    return null;
  }
  if (v.length !== PASSCODE_LENGTH) {
    console.error(`[passcode] WEDDING_PASSCODE の桁数が PASSCODE_LENGTH（${PASSCODE_LENGTH}）と違います`);
    return null;
  }
  return v;
}

/** 比較時間から桁を推測されないようにする */
export function passcodeMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * パスコードを通ったか。
 *
 * ★証明になるのはサーバーだけが書ける値★
 *   guestAdmin.passcodeClearedAt は /api/guest/passcode が、
 *   guests.isRegistered は /api/guest/register が書く（どちらも Rules でクライアントは書けない）。
 *   isRegistered は「パスコード通過が登録の前提」なので、通過の証明を兼ねる。
 */
export function isPasscodeCleared(publicSnap: DocumentSnapshot, adminSnap: DocumentSnapshot): boolean {
  return publicSnap.get("isRegistered") === true || adminSnap.get("passcodeClearedAt") != null;
}
