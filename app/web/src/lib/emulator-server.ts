import "server-only";
import { usingEmulator } from "@/lib/emulator";

/**
 * 開発用ログイン（/dev-login と /api/auth/dev）を開いてよいか。
 *
 * ★次のすべてがそろったときだけ true★
 *   - next dev で動いている（NODE_ENV が development）
 *   - Vercel の上ではない（本番・プレビューには VERCEL_ENV が付く）
 *   - npm run dev:emulator で起動した（NEXT_PUBLIC_FIREBASE_EMULATOR=1）
 *   - firebase-admin の接続先がエミュレーターになっている（*_EMULATOR_HOST）
 *   1つでも欠けたら 404 にする。本番の Firebase に向いたまま、テスト用アカウントの
 *   トークンを発行することがないようにするため。
 */
export function emulatorServerReady(): boolean {
  return (
    usingEmulator &&
    !process.env.VERCEL_ENV &&
    !!process.env.FIREBASE_AUTH_EMULATOR_HOST &&
    !!process.env.FIRESTORE_EMULATOR_HOST
  );
}
