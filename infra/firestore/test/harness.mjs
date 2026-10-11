/**
 * Firestore Security Rules のテストの土台（Issue #101）。
 *   登場人物（トークンの Claims）・初期データ・ケースの表を回す仕組みを置く。
 *   ケースそのものは rules.test.mjs の表に書く。
 *
 * ★つなぐ先はエミュレーターだけ★
 *   プロジェクト ID が demo- で始まらない、またはエミュレーターの接続先（FIRESTORE_EMULATOR_HOST）が
 *   無いときは、何もせずに止まる。サービスアカウントや本番の設定は読まない。
 * ★Rules は infra/firestore/firestore.rules をそのまま読む（コピーしない）★
 *   コピーを持つと、本物を変えてもテストが古い Rules を見て通ってしまう。
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, it } from "node:test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, serverTimestamp, setDoc, setLogLevel } from "firebase/firestore";

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(HERE, "..", "firestore.rules");
// package.json の --project と同じ値（firebase emulators:exec が GCLOUD_PROJECT に入れる）
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? "";

if (!PROJECT_ID.startsWith("demo-") || !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "Rules のテストはエミュレーターの中でだけ動かします。infra/firestore/test で npm test を実行してください" +
      "（プロジェクト ID は demo- で始まること）",
  );
  process.exit(1);
}

// 拒否のたびに SDK が出す警告を止める（結果は表の期待値と照らして報告する）
setLogLevel("silent");

export const ALLOW = "allow";
export const DENY = "deny";

/**
 * 登場人物。tags と admin は Custom Claims（本番では applyGuestTags と make-admin.mjs が付ける）。
 *   - pending:   LINE でログインしただけで、まだ承認されていない（tags が無い）
 *   - suspended: 停止されたゲスト。Rules は guestPrivate.isActive を見ない。停止は
 *                /api/admin/update-guest が tags を空にすることで効く（トークンの失効は Rules の外）
 *   - couple:    couple タグを持つが admin ではない人。admin との違いを確かめるために分けてある
 */
export const PEOPLE = {
  anon: null,
  pending: { uid: "u_pending", claims: {} },
  guest: { uid: "u_guest", claims: { tags: ["all", "guest"] } },
  ceremony: { uid: "u_ceremony", claims: { tags: ["all", "ceremony", "guest"] } },
  groomFriend: { uid: "u_groom", claims: { tags: ["all", "friends_groom", "guest"] } },
  brideFriend: { uid: "u_bride", claims: { tags: ["all", "friends_bride", "guest"] } },
  couple: { uid: "u_couple", claims: { tags: ["all", "couple", "guest"] } },
  admin: { uid: "u_admin", claims: { admin: true, tags: ["all", "couple"] } },
  suspended: { uid: "u_suspended", claims: { tags: [] } },
};

const LABELS = {
  anon: "未ログイン",
  pending: "未承認",
  guest: "ゲスト",
  ceremony: "挙式参列者",
  groomFriend: "新郎友人",
  brideFriend: "新婦友人",
  couple: "新郎新婦",
  admin: "管理者",
  suspended: "停止ゲスト",
};

export const uidOf = (who) => PEOPLE[who]?.uid ?? "u_nobody";

/** 投稿の形（validPost() が求めるキーをすべて持つ） */
export function postData(authorUid, over = {}) {
  return {
    authorUid,
    authorName: "テスト",
    text: "こんにちは",
    media: [],
    visibleToTags: ["all"],
    hashtags: [],
    mentions: [],
    status: "visible",
    reactionCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
    ...over,
  };
}

/** コメントの形（validComment() が求めるキーをすべて持つ） */
export function commentData(authorUid, over = {}) {
  return {
    authorUid,
    authorName: "テスト",
    text: "いいね",
    hashtags: [],
    mentions: [],
    visibleToTags: ["all"],
    createdAt: serverTimestamp(),
    ...over,
  };
}

/** キーを取り除いた写しを返す（「必須のキーが無い」ケース用） */
export function without(data, ...keys) {
  const copy = { ...data };
  for (const k of keys) delete copy[k];
  return copy;
}

/**
 * 初期データ。Rules を無効にした接続で書く（本番で Admin SDK が書くものに当たる）。
 * どのテストも、この状態から始まる。
 */
async function seed(db) {
  const put = (path, data) => setDoc(doc(db, path), data);
  const writes = [];

  for (const who of Object.keys(PEOPLE)) {
    if (!PEOPLE[who]) continue;
    const { uid, claims } = PEOPLE[who];
    writes.push(put(`guests/${uid}`, { nickname: who, tags: claims.tags ?? [], isApproved: (claims.tags ?? []).length > 0 }));
    writes.push(put(`guestPrivate/${uid}`, { attendance: "attend", isActive: who !== "suspended" }));
    writes.push(put(`guestAdmin/${uid}`, { aiMemo: "memo" }));
    writes.push(put(`notifications/${uid}/items/n_unread`, { type: "mention", fromUid: "u_admin", postId: "p_all", read: false }));
    writes.push(put(`notifications/${uid}/items/n_read`, { type: "mention", fromUid: "u_admin", postId: "p_all", read: true }));
    writes.push(put(`solves/s_${uid}`, { uid, challengeId: "ch_all" }));
  }

  // 投稿: 公開範囲・状態の違うものを1つずつ
  writes.push(put("posts/p_all", postData("u_guest", { reactionCount: 1, commentCount: 1 })));
  writes.push(put("posts/p_groom", postData("u_groom", { visibleToTags: ["friends_groom"], commentCount: 1 })));
  writes.push(put("posts/p_ceremony", postData("u_ceremony", { visibleToTags: ["ceremony"] })));
  writes.push(put("posts/p_couple", postData("u_guest", { visibleToTags: ["couple"], commentCount: 1 }))); // 新郎新婦あて
  writes.push(put("posts/p_hidden", postData("u_guest", { status: "hidden", commentCount: 1 }))); // 管理者が非表示にした
  writes.push(put("posts/p_suspended", postData("u_suspended")));
  // いいねが 0 件のはずなのに、いいねのドキュメントだけ残っている投稿（0 未満にできないことの確認用）
  writes.push(put("posts/p_zero", postData("u_guest", { reactionCount: 0 })));
  writes.push(put("posts/p_zero/reactions/u_groom", { emoji: "❤️", uid: "u_groom" }));

  writes.push(put("posts/p_all/comments/c_groom", commentData("u_groom")));
  writes.push(put("posts/p_groom/comments/c_groom", commentData("u_groom", { visibleToTags: ["friends_groom"] })));
  writes.push(put("posts/p_couple/comments/c_reply", commentData("u_admin", { visibleToTags: ["couple"] })));
  // 非表示の投稿のコメントは visibleToTags が空になる（/api/admin/posts/visibility）
  writes.push(put("posts/p_hidden/comments/c_hidden", { ...commentData("u_groom", { visibleToTags: [] }), hidden: true }));

  writes.push(put("posts/p_all/reactions/u_groom", { emoji: "❤️", uid: "u_groom" }));

  writes.push(put("faces/f1", { postId: "p_all", box: [0, 0, 1, 1] }));
  writes.push(put("episodes/e_all", { status: "approved", visibleToTags: ["all"], text: "思い出" }));
  writes.push(put("episodes/e_groom", { status: "approved", visibleToTags: ["friends_groom"], text: "思い出" }));
  writes.push(put("episodes/e_pending", { status: "pending", visibleToTags: ["all"], text: "思い出" }));
  writes.push(put("tags/c_0123abcd", { label: "テニス部", palette: "sky" }));
  writes.push(put("challenges/ch_all", { visibleToTags: ["all"], title: "問題" }));
  writes.push(put("challenges/ch_ctf", { visibleToTags: ["ctf_player"], title: "問題" }));

  // クライアントからは誰も触れないはずの場所
  writes.push(put("rateLimits/r1", { count: 1 }));
  writes.push(put("auditLogs/a1", { action: "x" }));
  writes.push(put("config/runtime", { maintenance: false }));
  writes.push(put("redeemAttempts/x1", { count: 1 }));
  writes.push(put("unknown/x1", { a: 1 }));
  writes.push(put("guests/u_guest/secret/x1", { a: 1 }));
  writes.push(put("posts/p_all/secret/x1", { a: 1 }));

  await Promise.all(writes);
}

let env;

function dbFor(who) {
  const person = PEOPLE[who];
  const ctx = person ? env.authenticatedContext(person.uid, person.claims) : env.unauthenticatedContext();
  return ctx.firestore();
}

/**
 * 期待どおりかを確かめる。
 *   許可のはずが拒否されたら、エミュレーターのメッセージ（拒否した Rules の行番号「L123」を含む）を出す。
 *   拒否のはずの操作が permission-denied 以外で失敗したら、テストの書き間違いとして失敗にする
 *   （クエリの組み立てミスを「拒否された」と数えないため）。
 */
async function check(expect, promise) {
  let error = null;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  if (expect === ALLOW) {
    if (error) throw new Error(`許可されるはずが拒否された: ${error.code ?? ""} ${error.message}`);
    return;
  }
  if (!error) throw new Error("拒否されるはずが許可された");
  if (error.code !== "permission-denied") {
    throw new Error(`Rules の拒否ではない失敗（テストの書き方を確かめる）: ${error.code ?? ""} ${error.message}`);
  }
}

/**
 * ケースの表を1つのグループとして登録する。
 * @param {string} title グループ名（コレクションと操作）
 * @param {Array<[string, "allow"|"deny", string, (db: import("firebase/firestore").Firestore, me: string) => Promise<unknown>]>} cases
 *   [人物, 期待結果, 説明, 操作]。操作には、その人物の Firestore と uid が渡る。
 */
export function table(title, cases) {
  describe(title, () => {
    for (const [who, expect, name, run] of cases) {
      if (!(who in PEOPLE)) throw new Error(`知らない人物: ${who}`);
      it(`${expect === ALLOW ? "○" : "×"} ${LABELS[who]}: ${name}`, async () => {
        await check(expect, run(dbFor(who), uidOf(who)));
      });
    }
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, "utf8") },
  });
});

// ★1テストごとに消して入れ直す★ 前のテストの書き込みが、次のテストの結果を変えないようにする
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled((ctx) => seed(ctx.firestore()));
});

after(async () => {
  await env?.cleanup();
});
