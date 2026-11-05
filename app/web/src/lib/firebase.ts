import { initializeApp, getApp, getApps, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth, signOut } from "firebase/auth";
import {
  clearIndexedDbPersistence, getFirestore, initializeFirestore, memoryLocalCache,
  persistentLocalCache, persistentMultipleTabManager, terminate, type Firestore,
} from "firebase/firestore";
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
  if (typeof window === "undefined" || !fresh) return getFirestore(firebaseApp);
  if (!usingEmulator) return createPersistentDb();
  connectAuthEmulator(auth, window.location.origin, { disableWarnings: true });
  return initializeFirestore(firebaseApp, {
    host: window.location.host,
    ssl: window.location.protocol === "https:",
    // 中継を挟むので、ストリーミングより確実な long polling にする
    experimentalForceLongPolling: true,
  });
}

/**
 * ★本番は、読んだ内容を端末（IndexedDB）に残す★（Issue #251。電波が悪くても速く開けるように）
 *   開いた瞬間に前回のタイムラインを端末から出し、そのあと変わった分だけを取りに行く。電波がほぼ無くても白くならない。
 *   persistentMultipleTabManager: タブを2つ開いても、両方で端末の保存を使う（片方だけにすると、もう片方が落ちる）。
 * ★残すのは、その人が Rules で読めたものだけ★（タイムラインの投稿・自分のプロフィールなど）。
 *   アクセス停止・別の LINE アカウントへの切り替え・ログアウトでは clearDeviceData() で消す。
 * ★保存できない環境（プライベートブラウズ・古い WebView など）では、今までのメモリに落ちる★
 *   SDK は IndexedDB を開けないと自分でメモリに切り替える。初期化そのものが投げたときもここでメモリにする。
 * エミュレーター（開発）の分岐は今のまま（上の createDb）。
 */
function createPersistentDb(): Firestore {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn("[firebase] 端末に保存できないため、メモリだけで動かします", e);
    return initializeFirestore(firebaseApp, { localCache: memoryLocalCache() });
  }
}

/**
 * サインアウトし、端末に残した Firestore の内容を消して、dest へ移る（Issue #251）。
 * ★消したあとは必ずページを読み直す★ terminate した db はもう使えない（以降の読み書きはすべて失敗する）。
 *   router.replace ではなく location.replace で移り、db を作り直させる。
 * ★消せなくてもサインアウトと移動はする★ ほかのタブが開いていると clearIndexedDbPersistence は断られる
 *   （failed-precondition）。そのときも、サインアウトしていれば Rules が新しい読み込みを止める。
 */
let clearing = false;
export async function clearDeviceData(dest: string): Promise<void> {
  // effect が続けて呼んでも1回だけ（terminate を2回走らせない）
  if (clearing) return;
  clearing = true;
  try {
    await signOut(auth);
  } catch (e) {
    console.warn("[firebase] サインアウトに失敗しました", e);
  }
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (e) {
    console.warn("[firebase] 端末に保存した内容を消せませんでした", e);
  }
  window.location.replace(dest);
}
