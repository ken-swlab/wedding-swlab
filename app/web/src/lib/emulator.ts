/**
 * Firebase エミュレーターにつないで動かしているか（開発用ログイン。Issue #83）。
 * ブラウザでもサーバーでも使える判定。サーバーで何かを許すときは、より厳しい
 * emulatorServerReady()（emulator-server.ts）を使う。
 *
 * ★NODE_ENV は本番のビルドで "production" に置き換わる★
 *   この式は本番のビルドで常に false になり、エミュレーター用の分岐ごと消える。
 *   NEXT_PUBLIC_FIREBASE_EMULATOR は npm run dev:emulator だけが付ける（.env には書かない）。
 */
export const usingEmulator =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1";
