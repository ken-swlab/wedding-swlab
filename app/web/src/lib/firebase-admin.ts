import "server-only"; // クライアントバンドルに混入したらビルド時に落とす

import {
  applicationDefault, cert, getApps, initializeApp, type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

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
