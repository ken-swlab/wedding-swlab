import devAccounts from "./dev-accounts.json";

/**
 * 開発用ログイン（Firebase エミュレーター）の定数。Issue #83。
 *
 * ★プロジェクト ID は demo- で始める★
 *   demo- のプロジェクトは Firebase が本物のプロジェクトとして扱わず、エミュレーターの外へは
 *   決してつながらない。設定を誤っても本番の Firestore・Auth に書き込まない最後の守り。
 * ★scripts/dev-emulator.mjs の PROJECT_ID と同じ値にする★（片方だけ変えるとログインできなくなる）
 */
export const EMULATOR_PROJECT_ID = "demo-wedding";

/**
 * テスト用アカウント（scripts/emulator-seed.mjs も同じ JSON を読む）。
 * ★開発用ログインで入れるのはこの uid だけ★ 実在のゲスト（line:…）にはなれない。
 * 個人情報の欄にはダミーの値だけを入れる。
 */
export type DevAccount = {
  key: string;
  uid: string;
  label: string;
  nickname: string;
  tags: string[];
  admin: boolean;
  /** ログイン後に開く画面 */
  home: string;
};
export const DEV_ACCOUNTS: readonly DevAccount[] = devAccounts;

/**
 * ブラウザから開発サーバー（next dev）経由でエミュレーターへ中継するパス。
 * Auth と Firestore の SDK は、接続先のオリジン直下にこれらのパスで要求を送る。
 */
export const EMULATOR_AUTH_PATHS = ["/identitytoolkit.googleapis.com", "/securetoken.googleapis.com"];
export const EMULATOR_FIRESTORE_PATHS = ["/google.firestore.v1.Firestore", "/v1/projects"];
