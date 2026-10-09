#!/usr/bin/env node
/**
 * 開発用ログインの初期データ（Issue #83）。Firebase エミュレーターにだけ書き込む。
 * npm run dev:emulator（scripts/dev-emulator.mjs）が、開発サーバーの前に毎回実行する。何度実行してもよい。
 *
 * ★エミュレーター以外では動かない★
 *   - FIREBASE_AUTH_EMULATOR_HOST と FIRESTORE_EMULATOR_HOST の両方が要る（firebase emulators:exec が付ける）
 *   - プロジェクト ID は demo- で始まるものだけ（src/config/emulator.ts の★参照）
 *   - .env.local を読まない（本番のサービスアカウントで初期化しない）
 * ★テスト用の admin クレームはここでだけ付ける★（CLAUDE.md のルール 7 の例外。エミュレーターの中だけ）
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const HERE = dirname(fileURLToPath(import.meta.url));
const projectId = process.env.GCLOUD_PROJECT ?? "";

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("[emulator-seed] エミュレーターの接続先がありません。npm run dev:emulator から実行してください");
  process.exit(1);
}
if (!projectId.startsWith("demo-")) {
  console.error(`[emulator-seed] プロジェクト ID が demo- で始まっていません（${projectId || "未設定"}）。中止します`);
  process.exit(1);
}

const accounts = JSON.parse(readFileSync(resolve(HERE, "..", "src", "config", "dev-accounts.json"), "utf8"));

initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();

function sameClaims(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

for (const a of accounts) {
  try {
    await auth.getUser(a.uid);
  } catch (e) {
    if (e?.code !== "auth/user-not-found") throw e;
    await auth.createUser({ uid: a.uid, displayName: a.nickname });
  }

  // applyGuestTags と同じく、変えたらリフレッシュトークンを失効させる
  const claims = { ...(a.admin ? { admin: true } : {}), tags: [...a.tags].sort() };
  const user = await auth.getUser(a.uid);
  if (!sameClaims(user.customClaims ?? {}, claims)) {
    await auth.setCustomUserClaims(a.uid, claims);
    await auth.revokeRefreshTokens(a.uid);
  }

  const batch = db.batch();
  // ★guests に本名を書かない★ ニックネームとタグだけ
  batch.set(
    db.collection("guests").doc(a.uid),
    {
      uid: a.uid,
      nickname: a.nickname,
      isRegistered: true,
      isApproved: true,
      tags: claims.tags,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  // 個人情報の欄はダミーだけ
  batch.set(
    db.collection("guestPrivate").doc(a.uid),
    {
      uid: a.uid,
      lineDisplayName: `（開発用）${a.nickname}`,
      lastName: "開発",
      firstName: a.key,
      lastKana: "かいはつ",
      firstKana: a.key,
      realName: `開発 ${a.key}`,
      kana: `かいはつ ${a.key}`,
      attendance: "both",
      ceremony: "party",
      hasAllergy: false,
      allergy: "",
      note: "",
      paymentStatus: "none",
      isActive: true,
      submittedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(
    db.collection("guestAdmin").doc(a.uid),
    { uid: a.uid, isAnonymous: false, passcodeClearedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
}

// 投稿が1件も無いときだけ、詳細画面やコメント欄を試すためのサンプルを置く
const anyPost = await db.collection("posts").limit(1).get();
if (anyPost.empty) {
  const author = accounts.find((a) => a.admin) ?? accounts[0];
  const samples = [
    "（開発用のサンプル投稿）コメント欄の確認に使ってください。",
    "（開発用のサンプル投稿）長めの本文です。\n" + "スクロールやキーボードの開閉を確かめるための文章です。".repeat(12),
  ];
  for (const text of samples) {
    await db.collection("posts").add({
      authorUid: author.uid,
      authorName: author.nickname,
      text,
      media: [],
      visibleToTags: ["all"],
      hashtags: [],
      mentions: [],
      status: "visible",
      reactionCount: 0,
      commentCount: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

console.log(`[emulator-seed] ${projectId}: テスト用アカウント ${accounts.map((a) => a.uid).join(", ")} を用意しました`);
