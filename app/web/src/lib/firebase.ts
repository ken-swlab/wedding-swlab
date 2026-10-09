import { initializeApp, getApp, getApps, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";
import { EMULATOR_PROJECT_ID } from "@/config/emulator";
import { usingEmulator } from "@/lib/emulator";

const firebaseConfig: FirebaseOptions = usingEmulator
  ? // エミュレーターは API キーを確かめない。プロジェクトは demo-（config/emulator.ts の★参照）
    { apiKey: "demo-api-key", projectId: EMULATOR_PROJECT_ID, appId: "demo-app" }
  : {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
    };

const fresh = getApps().length === 0;
export const firebaseApp = fresh ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(firebaseApp);
export const db = createDb();

/**
 * ★エミュレーターへは、いま開いているページのオリジン経由でつなぐ★
 *   開発サーバー（next dev）が next.config.ts の rewrites でエミュレーターへ中継する。
 *   エミュレーターのポート（9099・8080）を直接開かないので、Codespaces の転送 URL や
 *   iPhone からでも、ページと同じ 3000 番だけで動く。
 *   Firestore は connectFirestoreEmulator を使わない。これは常に http でつなぐため、
 *   https の Codespaces では通信が混在コンテンツとして止められる。
 */
function createDb(): Firestore {
  if (!usingEmulator || typeof window === "undefined") return getFirestore(firebaseApp);
  if (fresh) {
    connectAuthEmulator(auth, window.location.origin, { disableWarnings: true });
    return initializeFirestore(firebaseApp, {
      host: window.location.host,
      ssl: window.location.protocol === "https:",
      // 中継を挟むので、ストリーミングより確実な long polling にする
      experimentalForceLongPolling: true,
    });
  }
  return getFirestore(firebaseApp);
}
