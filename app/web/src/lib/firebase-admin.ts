import "server-only"; // クライアントバンドルに混入したらビルド時に落とす

/*
 * ★firebase-admin は 13 系に留める（Issue #38）★
 *   14 系は firebase-admin/auth → jwks-rsa 4 → ESM 専用の jose 6 を require() する。
 *   Vercel の関数ではここで ERR_REQUIRE_ESM になり、このファイルを読み込む API がすべて 500 になった
 *   （手元の Node 22 / 24 では再現しない）。上げるときはプレビューで /api/auth/line などが動くことを確かめる。
 */

import {
  applicationDefault, cert, getApps, initializeApp, type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { EMULATOR_PROJECT_ID } from "@/config/emulator";
import { usingEmulator } from "@/lib/emulator";

const APP_NAME = "wedding-admin";

type ServiceAccountJson = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function readServiceAccount(): ServiceAccountJson | null {
  // Vercel の環境変数は改行を壊しやすいので Base64 を優先して使う
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const raw = b64
    ? Buffer.from(b64, "base64").toString("utf8")
    : process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!raw) return null;

  try {
    return JSON.parse(raw) as ServiceAccountJson;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_* の JSON をパースできません");
  }
}

function createApp(): App {
  /**
   * ★エミュレーターでは本番の資格情報を読まない★（Issue #83）
   *   .env.local のサービスアカウントで初期化すると、*_EMULATOR_HOST が欠けたときに本番へつながる。
   *   資格情報なし・demo- のプロジェクトにしておけば、どこへ向いても本番には書き込めない。
   *   firebase-admin は FIREBASE_AUTH_EMULATOR_HOST・FIRESTORE_EMULATOR_HOST を見て接続先を変える。
   */
  if (usingEmulator) {
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error("エミュレーターの接続先がありません。npm run dev:emulator で起動してください");
    }
    return initializeApp({ projectId: EMULATOR_PROJECT_ID }, APP_NAME);
  }

  const sa = readServiceAccount();

  if (sa) {
    return initializeApp(
      {
        credential: cert({
          projectId: sa.project_id,
          clientEmail: sa.client_email,
          // 二重エスケープされた \n を実改行に戻す（正常な鍵なら無害）
          privateKey: sa.private_key.replace(/\\n/g, "\n"),
        }),
        projectId: sa.project_id,
      },
      APP_NAME,
    );
  }

  // Codespaces (gcloud auth application-default login) や
  // Cloud Run のメタデータサーバーの資格情報にフォールバックする
  return initializeApp(
    {
      credential: applicationDefault(),
      projectId:
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
        process.env.GOOGLE_CLOUD_PROJECT,
    },
    APP_NAME,
  );
}

let cached: { auth: Auth; db: Firestore } | null = null;

/**
 * 遅延初期化。モジュールのトップレベルで初期化すると
 * 環境変数が無いビルド時に落ちるため、呼び出し時まで遅らせる。
 */
export function admin(): { auth: Auth; db: Firestore } {
  if (!cached) {
    const app = getApps().find((a) => a.name === APP_NAME) ?? createApp();
    cached = { auth: getAuth(app), db: getFirestore(app) };
  }
  return cached;
}
