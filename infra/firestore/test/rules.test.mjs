/**
 * Firestore Security Rules の単体テスト（Issue #101）。
 *   cd infra/firestore/test && npm test
 *
 * 表の1行が1ケース: [人物, 期待結果, 説明, 操作]。人物と初期データは harness.mjs。
 * ★Rules を変える PR では、ここに対応するケース（許可と拒否の両方）を足す★
 * ★「現状」と書いたケースは、今の Rules の動きをそのまま固定したもの★
 *   望ましい動きかどうかは別に判断する。Rules を直すときは、そのケースの期待結果も一緒に変える。
 */
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { ALLOW, DENY, commentData, postData, table, without } from "./harness.mjs";

const FIXED_DATE = new Date("2027-05-29T03:00:00Z");
const many = (n, prefix = "x") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

const get = (path) => (db) => getDoc(doc(db, path));
const list = (path, ...constraints) => (db) => getDocs(query(collection(db, path), ...constraints));
const set = (path, data) => (db) => setDoc(doc(db, path), data);
const update = (path, data) => (db) => updateDoc(doc(db, path), data);
const del = (path) => (db) => deleteDoc(doc(db, path));

// ---------------------------------------------------------------------------
// guests
// ---------------------------------------------------------------------------
table("guests: 読み取り", [
  ["guest", ALLOW, "ほかのゲストのプロフィールを読める", get("guests/u_groom")],
  ["pending", ALLOW, "自分の分は読める（オンボーディングの分岐に使う）", get("guests/u_pending")],
  ["pending", DENY, "ほかの人の分は読めない", get("guests/u_guest")],
  ["suspended", ALLOW, "自分の分は読める", get("guests/u_suspended")],
  ["suspended", DENY, "ほかの人の分は読めない", get("guests/u_guest")],
  ["anon", DENY, "読めない", get("guests/u_guest")],
  ["admin", ALLOW, "読める", get("guests/u_guest")],
  ["guest", ALLOW, "一覧は limit 200 まで", list("guests", limit(200))],
  ["guest", DENY, "limit 201 の一覧は拒否", list("guests", limit(201))],
  ["guest", DENY, "limit なしの一覧は拒否", list("guests")],
  ["pending", DENY, "名簿を一覧できない", list("guests", limit(10))],
  ["suspended", DENY, "名簿を一覧できない", list("guests", limit(10))],
  ["anon", DENY, "名簿を一覧できない", list("guests", limit(10))],
  ["admin", ALLOW, "一覧は limit 500 まで", list("guests", limit(500))],
  ["admin", DENY, "limit 501 の一覧は拒否", list("guests", limit(501))],
]);

table("guests: 書き込み", [
  ["guest", DENY, "本人も自分の分を更新できない（/api/guest/profile 経由）", update("guests/u_guest", { nickname: "変更" })],
  ["guest", DENY, "自分のタグを書き換えられない", update("guests/u_guest", { tags: ["all", "couple"] })],
  ["pending", DENY, "自分の分を作れない", set("guests/u_new", { nickname: "新規" })],
  ["guest", DENY, "自分の分を消せない", del("guests/u_guest")],
  ["guest", DENY, "ほかの人の分を更新できない", update("guests/u_groom", { nickname: "変更" })],
  ["admin", ALLOW, "更新できる", update("guests/u_guest", { nickname: "変更" })],
  ["admin", ALLOW, "削除できる", del("guests/u_guest")],
  ["admin", DENY, "作成はできない（作るのはサーバーだけ）", set("guests/u_new", { nickname: "新規" })],
]);

// ---------------------------------------------------------------------------
// posts
// ---------------------------------------------------------------------------
table("posts: 1件の読み取り（canSee と status）", [
  ["guest", ALLOW, "全員あての投稿を読める", get("posts/p_all")],
  ["groomFriend", ALLOW, "新郎友人あての投稿を読める", get("posts/p_groom")],
  ["brideFriend", DENY, "新郎友人あての投稿は読めない", get("posts/p_groom")],
  ["guest", DENY, "新郎友人あての投稿は読めない", get("posts/p_groom")],
  ["ceremony", ALLOW, "挙式参列者あての投稿を読める", get("posts/p_ceremony")],
  ["guest", DENY, "挙式参列者あての投稿は読めない", get("posts/p_ceremony")],
  ["guest", ALLOW, "自分が書いた新郎新婦あての投稿を読める", get("posts/p_couple")],
  ["couple", ALLOW, "新郎新婦あての投稿を読める", get("posts/p_couple")],
  ["groomFriend", DENY, "他人の新郎新婦あての投稿は読めない", get("posts/p_couple")],
  ["admin", ALLOW, "どの公開範囲の投稿も読める", get("posts/p_groom")],
  ["guest", ALLOW, "非表示にされた自分の投稿は読める", get("posts/p_hidden")],
  ["admin", ALLOW, "非表示の投稿を読める", get("posts/p_hidden")],
  ["groomFriend", DENY, "非表示の投稿は、タグが重なっても読めない", get("posts/p_hidden")],
  ["couple", DENY, "非表示の投稿は、admin でなければ読めない", get("posts/p_hidden")],
  ["pending", DENY, "全員あての投稿も読めない", get("posts/p_all")],
  ["suspended", DENY, "全員あての投稿も読めない", get("posts/p_all")],
  ["suspended", ALLOW, "現状: 自分が書いた投稿だけは読める", get("posts/p_suspended")],
  ["anon", DENY, "読めない", get("posts/p_all")],
  ["guest", DENY, "存在しない投稿の get は拒否", get("posts/p_none")],
]);

const visible = where("status", "==", "visible");
const tagsAny = (...tags) => where("visibleToTags", "array-contains-any", tags);

table("posts: 一覧（Rules はフィルタではない）", [
  ["guest", ALLOW, "status と自分のタグの条件を付け、limit 50 なら読める", list("posts", visible, tagsAny("all", "guest"), limit(50))],
  ["guest", DENY, "limit 51 は拒否", list("posts", visible, tagsAny("all", "guest"), limit(51))],
  ["guest", DENY, "limit なしは拒否", list("posts", visible, tagsAny("all", "guest"))],
  ["guest", DENY, "条件なしは、見える投稿があっても全体が拒否", list("posts", limit(50))],
  ["guest", DENY, "visibleToTags の条件が無いと拒否", list("posts", visible, limit(50))],
  ["guest", DENY, "status の条件が無いと拒否（非表示の投稿が混ざる）", list("posts", tagsAny("all", "guest"), limit(50))],
  ["guest", DENY, "持っていないタグを条件に混ぜると拒否", list("posts", visible, tagsAny("all", "friends_groom"), limit(50))],
  ["brideFriend", DENY, "持っていないタグだけで絞っても拒否", list("posts", visible, tagsAny("friends_groom"), limit(50))],
  ["groomFriend", ALLOW, "自分のタグで絞れば読める", list("posts", visible, tagsAny("friends_groom"), limit(50))],
  ["guest", ALLOW, "自分の投稿の一覧（マイページ）は読める", list("posts", where("authorUid", "==", "u_guest"), limit(50))],
  ["guest", DENY, "他人の投稿を authorUid で一覧できない", list("posts", where("authorUid", "==", "u_groom"), limit(50))],
  ["pending", DENY, "条件を付けても読めない", list("posts", visible, tagsAny("all"), limit(50))],
  ["suspended", DENY, "条件を付けても読めない", list("posts", visible, tagsAny("all"), limit(50))],
  ["anon", DENY, "読めない", list("posts", visible, tagsAny("all"), limit(50))],
  ["admin", ALLOW, "条件なしで全投稿を読める（limit 50）", list("posts", limit(50))],
  ["admin", DENY, "limit 51 は拒否", list("posts", limit(51))],
]);

const create = (overOrFn = {}) => (db, me) =>
  setDoc(doc(db, "posts/p_new"), typeof overOrFn === "function" ? overOrFn(postData(me)) : postData(me, overOrFn));

table("posts: 作成（validPost と公開範囲）", [
  ["guest", ALLOW, "自分のタグの範囲で作れる", create()],
  ["guest", ALLOW, "任意のキー（アイコン・メンションの uid・updatedAt）を付けて作れる",
    create({ authorPhotoURL: "https://example.com/a.png", mentionUids: many(10, "u"), updatedAt: serverTimestamp() })],
  ["groomFriend", ALLOW, "自分の持つ複数のタグあてに作れる", create({ visibleToTags: ["friends_groom", "guest"] })],
  ["guest", ALLOW, "新郎新婦あて（['couple'] ちょうど）は作れる", create({ visibleToTags: ["couple"] })],
  ["admin", ALLOW, "自分が持たないタグあてにも作れる", create({ visibleToTags: ["friends_bride"] })],
  ["guest", DENY, "他人の名前（authorUid）では作れない", create({ authorUid: "u_groom" })],
  ["guest", DENY, "余計なキーがあると拒否", create({ pinned: true })],
  ["guest", DENY, "必須のキー（hashtags）が無いと拒否", create((d) => without(d, "hashtags"))],
  ["guest", DENY, "status が visible でないと拒否", create({ status: "hidden" })],
  ["guest", DENY, "reactionCount が 0 でないと拒否", create({ reactionCount: 100 })],
  ["guest", DENY, "commentCount が 0 でないと拒否", create({ commentCount: 1 })],
  ["guest", DENY, "createdAt がサーバー時刻でないと拒否", create({ createdAt: FIXED_DATE })],
  ["guest", DENY, "持っていないタグあては拒否", create({ visibleToTags: ["friends_groom"] })],
  ["guest", DENY, "自分のタグに持っていないタグを混ぜると拒否", create({ visibleToTags: ["all", "ceremony"] })],
  ["guest", DENY, "couple をほかのタグと混ぜると拒否", create({ visibleToTags: ["all", "couple"] })],
  ["couple", DENY, "couple タグを持っていても、ほかのタグと混ぜると拒否", create({ visibleToTags: ["all", "couple"] })],
  ["guest", DENY, "公開範囲が空だと拒否", create({ visibleToTags: [] })],
  ["guest", DENY, "公開範囲がリストでないと拒否", create({ visibleToTags: "all" })],
  ["guest", DENY, "mentions が 11 件だと拒否", create({ mentions: many(11) })],
  ["guest", DENY, "mentionUids が 11 件だと拒否", create({ mentionUids: many(11, "u") })],
  ["guest", DENY, "hashtags が 11 件だと拒否", create({ hashtags: many(11) })],
  ["guest", DENY, "media が 5 件だと拒否", create({ media: many(5) })],
  ["guest", DENY, "本文が 4001 文字だと拒否", create({ text: "あ".repeat(4001) })],
  ["guest", DENY, "authorName が空だと拒否", create({ authorName: "" })],
  ["guest", DENY, "authorName が 41 文字だと拒否", create({ authorName: "あ".repeat(41) })],
  ["pending", DENY, "全員あてには作れない", create()],
  ["suspended", DENY, "全員あてには作れない", create()],
  ["pending", ALLOW, "現状: 新郎新婦あてなら未承認でも作れる", create({ visibleToTags: ["couple"] })],
  ["suspended", ALLOW, "現状: 新郎新婦あてなら停止中でも作れる", create({ visibleToTags: ["couple"] })],
  ["anon", DENY, "作れない", create({ visibleToTags: ["couple"] })],
]);

const now = () => ({ updatedAt: serverTimestamp() });

table("posts: 本人・管理者の更新と削除", [
  ["guest", ALLOW, "自分の投稿の media と updatedAt を更新できる", update("posts/p_all", { media: [{ key: "u/u_guest/o/a.jpg" }], ...now() })],
  ["guest", ALLOW, "media だけの更新もできる", update("posts/p_all", { media: [] })],
  ["guest", DENY, "media を 5 件にはできない", update("posts/p_all", { media: many(5) })],
  ["guest", DENY, "updatedAt にサーバー時刻以外は書けない", update("posts/p_all", { media: [], updatedAt: FIXED_DATE })],
  ["guest", DENY, "本文は直接書き換えられない（/api/posts/[id] 経由）", update("posts/p_all", { text: "書き換え", ...now() })],
  ["guest", DENY, "公開範囲は直接書き換えられない", update("posts/p_all", { visibleToTags: ["guest"] })],
  ["guest", DENY, "非表示にされた自分の投稿を visible に戻せない", update("posts/p_hidden", { status: "visible" })],
  ["guest", DENY, "authorUid を書き換えられない", update("posts/p_all", { authorUid: "u_groom" })],
  ["guest", DENY, "余計なキーを足せない", update("posts/p_all", { pinned: true })],
  ["groomFriend", DENY, "他人の投稿の media は更新できない", update("posts/p_all", { media: [] })],
  ["admin", ALLOW, "本文も公開範囲も更新できる", update("posts/p_all", { text: "管理者が修正", visibleToTags: ["guest"] })],
  ["guest", ALLOW, "自分の投稿を削除できる", del("posts/p_all")],
  ["admin", ALLOW, "他人の投稿を削除できる", del("posts/p_all")],
  ["groomFriend", DENY, "他人の投稿は削除できない", del("posts/p_all")],
  ["couple", DENY, "admin でなければ他人の投稿は削除できない", del("posts/p_all")],
  ["anon", DENY, "削除できない", del("posts/p_all")],
]);

/** いいねの操作: リアクションの作成・削除と、カウンタの増減を1つのバッチにまとめる（lib/posts.ts の toggleReaction と同じ形） */
const react = ({ post = "p_all", reaction = "none", count = 0, extra = {} }) => (db, me) => {
  const batch = writeBatch(db);
  const ref = doc(db, `posts/${post}/reactions/${me}`);
  if (reaction === "create") batch.set(ref, { emoji: "❤️", uid: me, createdAt: serverTimestamp() });
  if (reaction === "delete") batch.delete(ref);
  if (count !== 0 || Object.keys(extra).length > 0) {
    batch.update(doc(db, `posts/${post}`), { ...(count !== 0 ? { reactionCount: increment(count) } : {}), ...now(), ...extra });
  }
  return batch.commit();
};

table("posts: いいねの数（±1、いいねの作成・削除と対のときだけ）", [
  ["guest", ALLOW, "いいねの作成と同時なら +1 できる", react({ reaction: "create", count: 1 })],
  ["groomFriend", ALLOW, "いいねの削除と同時なら -1 できる", react({ reaction: "delete", count: -1 })],
  ["guest", DENY, "いいねを作らずに +1 はできない（水増し）", react({ count: 1 })],
  ["guest", DENY, "いいねを消さずに -1 はできない", react({ count: -1 })],
  ["groomFriend", DENY, "すでにいいね済みの人は、重ねて +1 できない", react({ reaction: "create", count: 1 })],
  ["guest", DENY, "いいねしていない人は、削除と一緒でも -1 できない", react({ reaction: "delete", count: -1 })],
  ["guest", DENY, "いいねの作成と同時でも +2 はできない", react({ reaction: "create", count: 2 })],
  ["groomFriend", DENY, "0 件の投稿を -1 して負の数にはできない", react({ post: "p_zero", reaction: "delete", count: -1 })],
  ["guest", DENY, "+1 と一緒にほかのフィールドは変えられない", react({ reaction: "create", count: 1, extra: { text: "書き換え" } })],
  ["brideFriend", DENY, "見えない投稿にはいいねも +1 もできない", react({ post: "p_groom", reaction: "create", count: 1 })],
  ["pending", DENY, "未承認の人はいいねも +1 もできない", react({ reaction: "create", count: 1 })],
]);

const bump = (post, field, delta, extra = {}) => update(`posts/${post}`, { [field]: increment(delta), ...now(), ...extra });

table("posts: コメントの数（±1）", [
  ["groomFriend", ALLOW, "見える投稿の commentCount を +1 できる", bump("p_all", "commentCount", 1)],
  ["groomFriend", ALLOW, "見える投稿の commentCount を -1 できる", bump("p_all", "commentCount", -1)],
  ["groomFriend", ALLOW, "現状: コメントの作成・削除と対でなくても ±1 できる", bump("p_all", "commentCount", 1)],
  ["groomFriend", DENY, "+2 はできない", bump("p_all", "commentCount", 2)],
  ["groomFriend", DENY, "0 件の投稿を -1 して負の数にはできない", bump("p_ceremony", "commentCount", -1)],
  ["groomFriend", DENY, "updatedAt にサーバー時刻以外は書けない", bump("p_all", "commentCount", 1, { updatedAt: FIXED_DATE })],
  ["groomFriend", DENY, "+1 と一緒に本文は変えられない", bump("p_all", "commentCount", 1, { text: "書き換え" })],
  ["brideFriend", DENY, "見えない投稿の commentCount は動かせない", bump("p_groom", "commentCount", 1)],
  ["groomFriend", DENY, "非表示の投稿の commentCount は動かせない", bump("p_hidden", "commentCount", 1)],
  ["pending", DENY, "未承認の人は動かせない", bump("p_all", "commentCount", 1)],
  ["anon", DENY, "動かせない", bump("p_all", "commentCount", 1)],
]);

// ---------------------------------------------------------------------------
// posts/{id}/comments
// ---------------------------------------------------------------------------
const comments = (post) => `posts/${post}/comments`;

table("comments: 読み取り", [
  ["guest", ALLOW, "見える投稿のコメントを読める", get("posts/p_all/comments/c_groom")],
  ["groomFriend", ALLOW, "新郎友人あての投稿のコメントを読める", get("posts/p_groom/comments/c_groom")],
  ["brideFriend", DENY, "見えない投稿のコメントは読めない", get("posts/p_groom/comments/c_groom")],
  ["pending", DENY, "読めない", get("posts/p_all/comments/c_groom")],
  ["anon", DENY, "読めない", get("posts/p_all/comments/c_groom")],
  ["groomFriend", ALLOW, "非表示になった自分のコメントは読める", get("posts/p_hidden/comments/c_hidden")],
  ["ceremony", DENY, "非表示になった他人のコメントは読めない", get("posts/p_hidden/comments/c_hidden")],
  ["guest", ALLOW, "自分の新郎新婦あての投稿に付いた返事を読める", get("posts/p_couple/comments/c_reply")],
  ["groomFriend", DENY, "他人の新郎新婦あての投稿の返事は読めない", get("posts/p_couple/comments/c_reply")],
  ["guest", ALLOW, "一覧は limit 100 まで", list(comments("p_all"), limit(100))],
  ["guest", DENY, "limit 101 の一覧は拒否", list(comments("p_all"), limit(101))],
  ["guest", DENY, "limit なしの一覧は拒否", list(comments("p_all"))],
  ["brideFriend", DENY, "見えない投稿のコメントは一覧できない", list(comments("p_groom"), limit(100))],
  ["groomFriend", DENY, "非表示の投稿のコメントは一覧できない", list(comments("p_hidden"), limit(100))],
  ["guest", ALLOW, "非表示にされた自分の投稿のコメントは一覧できる", list(comments("p_hidden"), limit(100))],
  ["admin", ALLOW, "非表示の投稿のコメントを一覧できる", list(comments("p_hidden"), limit(100))],
  ["pending", DENY, "一覧できない", list(comments("p_all"), limit(100))],
]);

const comment = (post, overOrFn = {}) => (db, me) =>
  setDoc(doc(db, `posts/${post}/comments/c_new`), typeof overOrFn === "function" ? overOrFn(commentData(me)) : commentData(me, overOrFn));

table("comments: 作成・更新・削除", [
  ["groomFriend", ALLOW, "見える投稿に、親と同じ公開範囲でコメントできる", comment("p_all")],
  ["groomFriend", ALLOW, "任意のキー（アイコン・メンションの uid）を付けられる", comment("p_all", { authorPhotoURL: "https://example.com/a.png", mentionUids: ["u_guest"] })],
  ["groomFriend", DENY, "公開範囲が親より広いと拒否", comment("p_all", { visibleToTags: ["all", "guest"] })],
  ["groomFriend", DENY, "公開範囲が親と違う（狭い）と拒否", comment("p_groom", { visibleToTags: ["all"] })],
  ["groomFriend", ALLOW, "新郎友人あての投稿には、その公開範囲でコメントできる", comment("p_groom", { visibleToTags: ["friends_groom"] })],
  ["brideFriend", DENY, "見えない投稿にはコメントできない", comment("p_groom", { visibleToTags: ["friends_groom"] })],
  ["groomFriend", DENY, "再発防止: 非表示の投稿にはコメントできない", comment("p_hidden")],
  ["guest", DENY, "再発防止: 非表示にされた自分の投稿にもコメントできない", comment("p_hidden")],
  ["admin", DENY, "現状: 管理者も非表示の投稿にはコメントできない", comment("p_hidden")],
  ["guest", ALLOW, "自分の新郎新婦あての投稿には、タグが重ならなくてもコメントできる", comment("p_couple", { visibleToTags: ["couple"] })],
  ["couple", ALLOW, "新郎新婦あての投稿に返事を書ける", comment("p_couple", { visibleToTags: ["couple"] })],
  ["groomFriend", DENY, "他人の新郎新婦あての投稿にはコメントできない", comment("p_couple", { visibleToTags: ["couple"] })],
  ["groomFriend", DENY, "存在しない投稿にはコメントできない", comment("p_none")],
  ["groomFriend", DENY, "他人の名前（authorUid）では書けない", comment("p_all", { authorUid: "u_guest" })],
  ["groomFriend", DENY, "本文が空だと拒否", comment("p_all", { text: "" })],
  ["groomFriend", DENY, "本文が 601 文字だと拒否", comment("p_all", { text: "あ".repeat(601) })],
  ["groomFriend", DENY, "createdAt がサーバー時刻でないと拒否", comment("p_all", { createdAt: FIXED_DATE })],
  ["groomFriend", DENY, "余計なキー（hidden）があると拒否", comment("p_all", { hidden: false })],
  ["groomFriend", DENY, "必須のキー（mentions）が無いと拒否", comment("p_all", (d) => without(d, "mentions"))],
  ["groomFriend", DENY, "mentionUids が 11 件だと拒否", comment("p_all", { mentionUids: many(11, "u") })],
  ["pending", DENY, "未承認の人はコメントできない", comment("p_all")],
  ["suspended", DENY, "停止中の人はコメントできない", comment("p_all")],
  ["anon", DENY, "コメントできない", comment("p_all")],
  ["groomFriend", DENY, "自分のコメントも更新できない", update("posts/p_all/comments/c_groom", { text: "書き換え" })],
  ["groomFriend", DENY, "非表示になった自分のコメントの公開範囲を戻せない", update("posts/p_hidden/comments/c_hidden", { visibleToTags: ["all"] })],
  ["admin", DENY, "管理者も更新できない", update("posts/p_all/comments/c_groom", { text: "書き換え" })],
  ["groomFriend", ALLOW, "自分のコメントを削除できる", del("posts/p_all/comments/c_groom")],
  ["admin", ALLOW, "他人のコメントを削除できる", del("posts/p_all/comments/c_groom")],
  ["guest", DENY, "投稿の作者でも、他人のコメントは削除できない", del("posts/p_all/comments/c_groom")],
]);

const allComments = (...constraints) => (db) => getDocs(query(collectionGroup(db, "comments"), ...constraints));

table("comments: 横断購読（collectionGroup）", [
  ["guest", ALLOW, "自分のタグの条件を付け、limit 100 なら読める", allComments(tagsAny("all", "guest"), limit(100))],
  ["guest", DENY, "limit 101 は拒否", allComments(tagsAny("all", "guest"), limit(101))],
  ["guest", DENY, "条件なしは全体が拒否", allComments(limit(100))],
  ["guest", DENY, "持っていないタグを条件に混ぜると拒否", allComments(tagsAny("all", "friends_groom"), limit(100))],
  ["groomFriend", ALLOW, "自分のコメント（非表示になったものを含む）を authorUid で一覧できる", allComments(where("authorUid", "==", "u_groom"), limit(100))],
  ["guest", DENY, "他人のコメントを authorUid で一覧できない", allComments(where("authorUid", "==", "u_groom"), limit(100))],
  ["pending", DENY, "条件を付けても読めない", allComments(tagsAny("all"), limit(100))],
  ["anon", DENY, "読めない", allComments(tagsAny("all"), limit(100))],
  ["admin", ALLOW, "条件なしで読める（limit 100）", allComments(limit(100))],
  ["admin", DENY, "limit 101 は拒否", allComments(limit(101))],
]);

// ---------------------------------------------------------------------------
// posts/{id}/reactions/{uid}
// ---------------------------------------------------------------------------
const myReaction = (post, overOrFn = {}) => (db, me) => {
  const base = { emoji: "❤️", uid: me, createdAt: serverTimestamp() };
  return setDoc(doc(db, `posts/${post}/reactions/${me}`), typeof overOrFn === "function" ? overOrFn(base) : { ...base, ...overOrFn });
};

table("reactions: 本人の1件だけ", [
  ["groomFriend", ALLOW, "自分のいいねを読める", get("posts/p_all/reactions/u_groom")],
  ["guest", ALLOW, "まだ無い自分のいいねを get できる（いいね済みかの確認）", get("posts/p_all/reactions/u_guest")],
  ["guest", DENY, "再発防止: 他人のいいねは読めない", get("posts/p_all/reactions/u_groom")],
  ["guest", DENY, "再発防止: いいねした人を一覧できない", list("posts/p_all/reactions", limit(10))],
  ["pending", DENY, "再発防止: 未承認の人は他人のいいねを読めない", get("posts/p_all/reactions/u_groom")],
  ["anon", DENY, "読めない", get("posts/p_all/reactions/u_groom")],
  ["admin", ALLOW, "他人のいいねを読める", get("posts/p_all/reactions/u_groom")],
  ["admin", ALLOW, "一覧は limit 500 まで", list("posts/p_all/reactions", limit(500))],
  ["admin", DENY, "limit 501 の一覧は拒否", list("posts/p_all/reactions", limit(501))],
  ["guest", ALLOW, "見える投稿に自分のいいねを作れる", myReaction("p_all")],
  ["guest", ALLOW, "emoji だけでも作れる（uid と createdAt は任意）", myReaction("p_all", (d) => without(d, "uid", "createdAt"))],
  ["groomFriend", ALLOW, "自分のいいねの絵文字を変えられる", myReaction("p_all", { emoji: "🎉" })],
  ["guest", DENY, "他人の名前のいいねは作れない", set("posts/p_all/reactions/u_groom", { emoji: "❤️", uid: "u_groom" })],
  ["guest", DENY, "uid フィールドを他人にはできない", myReaction("p_all", { uid: "u_groom" })],
  ["guest", DENY, "余計なキーがあると拒否", myReaction("p_all", { weight: 100 })],
  ["guest", DENY, "emoji が 9 文字だと拒否", myReaction("p_all", { emoji: "a".repeat(9) })],
  ["guest", DENY, "createdAt がサーバー時刻でないと拒否", myReaction("p_all", { createdAt: FIXED_DATE })],
  ["brideFriend", DENY, "見えない投稿にはいいねできない", myReaction("p_groom")],
  ["groomFriend", DENY, "非表示の投稿にはいいねできない", myReaction("p_hidden")],
  ["pending", DENY, "未承認の人はいいねできない", myReaction("p_all")],
  ["suspended", DENY, "停止中の人はいいねできない", myReaction("p_all")],
  ["groomFriend", ALLOW, "自分のいいねを消せる", del("posts/p_all/reactions/u_groom")],
  ["guest", DENY, "他人のいいねは消せない", del("posts/p_all/reactions/u_groom")],
  ["admin", DENY, "現状: 管理者も他人のいいねは消せない", del("posts/p_all/reactions/u_groom")],
]);

// ---------------------------------------------------------------------------
// notifications/{uid}/items
// ---------------------------------------------------------------------------
table("notifications: 本人だけ", [
  ["guest", ALLOW, "自分あての通知を読める", get("notifications/u_guest/items/n_unread")],
  ["guest", DENY, "他人あての通知は読めない", get("notifications/u_groom/items/n_unread")],
  ["admin", DENY, "管理者も他人あての通知は読めない", get("notifications/u_guest/items/n_unread")],
  ["anon", DENY, "読めない", get("notifications/u_guest/items/n_unread")],
  ["guest", ALLOW, "一覧は limit 50 まで", list("notifications/u_guest/items", limit(50))],
  ["guest", DENY, "limit 51 の一覧は拒否", list("notifications/u_guest/items", limit(51))],
  ["guest", DENY, "他人あての通知は一覧できない", list("notifications/u_groom/items", limit(50))],
  ["guest", ALLOW, "read を true にできる", update("notifications/u_guest/items/n_unread", { read: true })],
  ["guest", DENY, "read を false に戻せない", update("notifications/u_guest/items/n_read", { read: false })],
  ["guest", DENY, "read 以外は書き換えられない", update("notifications/u_guest/items/n_unread", { read: true, fromUid: "u_guest" })],
  ["guest", DENY, "他人あての通知を既読にできない", update("notifications/u_groom/items/n_unread", { read: true })],
  ["guest", DENY, "自分あての通知も作れない（作るのはサーバーだけ）", set("notifications/u_guest/items/n_new", { type: "mention", read: false })],
  ["guest", DENY, "他人あての通知を作れない", set("notifications/u_groom/items/n_new", { type: "mention", read: false })],
  ["admin", DENY, "管理者もクライアントからは作れない", set("notifications/u_guest/items/n_new", { type: "mention", read: false })],
  ["guest", DENY, "自分あての通知を消せない", del("notifications/u_guest/items/n_unread")],
]);

// ---------------------------------------------------------------------------
// guestPrivate / guestAdmin / faces
// ---------------------------------------------------------------------------
table("guestPrivate: 本人と管理者だけ（本名・出欠・アレルギー）", [
  ["guest", ALLOW, "自分の分を読める", get("guestPrivate/u_guest")],
  ["pending", ALLOW, "未承認でも自分の分は読める", get("guestPrivate/u_pending")],
  ["guest", DENY, "他人の分は読めない", get("guestPrivate/u_groom")],
  ["couple", DENY, "admin でなければ他人の分は読めない", get("guestPrivate/u_guest")],
  ["anon", DENY, "読めない", get("guestPrivate/u_guest")],
  ["guest", DENY, "一覧できない", list("guestPrivate", limit(10))],
  ["admin", ALLOW, "他人の分を読める", get("guestPrivate/u_guest")],
  ["admin", ALLOW, "一覧は limit 500 まで", list("guestPrivate", limit(500))],
  ["admin", DENY, "limit 501 の一覧は拒否", list("guestPrivate", limit(501))],
  ["guest", DENY, "自分の分も書けない", update("guestPrivate/u_guest", { attendance: "absent" })],
  ["suspended", DENY, "自分の停止（isActive）を解除できない", update("guestPrivate/u_suspended", { isActive: true })],
  ["guest", DENY, "作れない", set("guestPrivate/u_new", { attendance: "attend" })],
  ["guest", DENY, "消せない", del("guestPrivate/u_guest")],
  ["admin", DENY, "管理者もクライアントからは書けない", update("guestPrivate/u_guest", { attendance: "absent" })],
]);

table("guestAdmin: 管理者だけ（運営メモ）", [
  ["admin", ALLOW, "読める", get("guestAdmin/u_guest")],
  ["admin", ALLOW, "一覧は limit 500 まで", list("guestAdmin", limit(500))],
  ["admin", DENY, "limit 501 の一覧は拒否", list("guestAdmin", limit(501))],
  ["guest", DENY, "自分についてのメモも読めない", get("guestAdmin/u_guest")],
  ["couple", DENY, "admin でなければ読めない", get("guestAdmin/u_guest")],
  ["guest", DENY, "一覧できない", list("guestAdmin", limit(10))],
  ["anon", DENY, "読めない", get("guestAdmin/u_guest")],
  ["guest", DENY, "書けない", set("guestAdmin/u_guest", { aiMemo: "x" })],
  ["admin", DENY, "管理者もクライアントからは書けない", set("guestAdmin/u_guest", { aiMemo: "x" })],
]);

table("faces: 管理者だけ（顔の座標）", [
  ["admin", ALLOW, "読める", get("faces/f1")],
  ["admin", ALLOW, "一覧は limit 300 まで", list("faces", limit(300))],
  ["admin", DENY, "limit 301 の一覧は拒否", list("faces", limit(301))],
  ["guest", DENY, "読めない", get("faces/f1")],
  ["couple", DENY, "admin でなければ読めない", get("faces/f1")],
  ["guest", DENY, "一覧できない", list("faces", limit(10))],
  ["anon", DENY, "読めない", get("faces/f1")],
  ["guest", DENY, "書けない", set("faces/f2", { postId: "p_all" })],
  ["admin", DENY, "管理者もクライアントからは書けない", set("faces/f2", { postId: "p_all" })],
]);

// ---------------------------------------------------------------------------
// episodes / tags / challenges / solves
// ---------------------------------------------------------------------------
const approved = where("status", "==", "approved");

table("episodes: 承認済みかつ canSee", [
  ["guest", ALLOW, "承認済みの全員あてのエピソードを読める", get("episodes/e_all")],
  ["guest", DENY, "承認前のエピソードは読めない", get("episodes/e_pending")],
  ["groomFriend", ALLOW, "新郎友人あてのエピソードを読める", get("episodes/e_groom")],
  ["brideFriend", DENY, "新郎友人あてのエピソードは読めない", get("episodes/e_groom")],
  ["pending", DENY, "読めない", get("episodes/e_all")],
  ["anon", DENY, "読めない", get("episodes/e_all")],
  ["admin", ALLOW, "承認前のエピソードも読める", get("episodes/e_pending")],
  ["guest", ALLOW, "status と自分のタグの条件を付け、limit 50 なら一覧できる", list("episodes", approved, tagsAny("all", "guest"), limit(50))],
  ["guest", DENY, "limit 51 は拒否", list("episodes", approved, tagsAny("all", "guest"), limit(51))],
  ["guest", DENY, "status の条件が無いと拒否", list("episodes", tagsAny("all", "guest"), limit(50))],
  ["guest", DENY, "visibleToTags の条件が無いと拒否", list("episodes", approved, limit(50))],
  ["guest", DENY, "条件なしは拒否", list("episodes", limit(50))],
  ["admin", ALLOW, "条件なしで一覧できる（limit 500）", list("episodes", limit(500))],
  ["admin", DENY, "limit 501 は拒否", list("episodes", limit(501))],
  ["guest", DENY, "書けない", set("episodes/e_new", { status: "approved", visibleToTags: ["all"] })],
  ["admin", DENY, "管理者もクライアントからは書けない", update("episodes/e_pending", { status: "approved" })],
]);

table("tags: サインイン済みなら読める（表示用の語彙）", [
  ["guest", ALLOW, "読める", get("tags/c_0123abcd")],
  ["pending", ALLOW, "現状: 未承認でも読める", get("tags/c_0123abcd")],
  ["anon", DENY, "読めない", get("tags/c_0123abcd")],
  ["guest", ALLOW, "一覧は limit 200 まで", list("tags", limit(200))],
  ["guest", DENY, "limit 201 の一覧は拒否", list("tags", limit(201))],
  ["anon", DENY, "一覧できない", list("tags", limit(10))],
  ["guest", DENY, "書けない", set("tags/c_new", { label: "x" })],
  ["admin", DENY, "管理者もクライアントからは書けない", set("tags/c_new", { label: "x" })],
]);

table("challenges: canSee（CTF。保留中）", [
  ["guest", ALLOW, "自分のタグあての問題を読める", get("challenges/ch_all")],
  ["guest", DENY, "持っていないタグあての問題は読めない", get("challenges/ch_ctf")],
  ["admin", ALLOW, "どの問題も読める", get("challenges/ch_ctf")],
  ["pending", DENY, "読めない", get("challenges/ch_all")],
  ["anon", DENY, "読めない", get("challenges/ch_all")],
  ["guest", ALLOW, "自分のタグの条件を付け、limit 100 なら一覧できる", list("challenges", tagsAny("all", "guest"), limit(100))],
  ["guest", DENY, "limit 101 は拒否", list("challenges", tagsAny("all", "guest"), limit(101))],
  ["guest", DENY, "条件なしは拒否", list("challenges", limit(100))],
  ["guest", DENY, "書けない", set("challenges/ch_new", { visibleToTags: ["all"] })],
  ["admin", DENY, "管理者もクライアントからは書けない", set("challenges/ch_new", { visibleToTags: ["all"] })],
]);

table("solves: 本人と管理者だけ（CTF。保留中）", [
  ["guest", ALLOW, "自分の解答を読める", get("solves/s_u_guest")],
  ["guest", DENY, "他人の解答は読めない", get("solves/s_u_groom")],
  ["admin", ALLOW, "他人の解答を読める", get("solves/s_u_guest")],
  ["anon", DENY, "読めない", get("solves/s_u_guest")],
  ["guest", ALLOW, "自分の解答を uid で一覧できる", list("solves", where("uid", "==", "u_guest"), limit(50))],
  ["guest", DENY, "条件なしは拒否", list("solves", limit(50))],
  ["guest", DENY, "他人の解答を uid で一覧できない", list("solves", where("uid", "==", "u_groom"), limit(50))],
  ["admin", ALLOW, "条件なしで一覧できる", list("solves", limit(50))],
  ["guest", DENY, "書けない（正解の自己申告）", set("solves/s_new", { uid: "u_guest", challengeId: "ch_all" })],
  ["admin", DENY, "管理者もクライアントからは書けない", set("solves/s_new", { uid: "u_guest", challengeId: "ch_all" })],
]);

// ---------------------------------------------------------------------------
// サーバー専用の場所と、Rules に書かれていないパス（既定拒否）
// ---------------------------------------------------------------------------
const lockedDown = (label, docPath) => {
  const col = docPath.split("/").slice(0, -1).join("/");
  return [
    ["guest", DENY, `${label}: 読めない`, get(docPath)],
    ["guest", DENY, `${label}: 一覧できない`, list(col, limit(1))],
    ["guest", DENY, `${label}: 作れない`, set(`${col}/new`, { a: 1 })],
    ["guest", DENY, `${label}: 更新できない`, update(docPath, { a: 2 })],
    ["guest", DENY, `${label}: 消せない`, del(docPath)],
    ["admin", DENY, `${label}: 管理者も読めない`, get(docPath)],
    ["admin", DENY, `${label}: 管理者も一覧できない`, list(col, limit(1))],
    ["admin", DENY, `${label}: 管理者も書けない`, set(`${col}/new`, { a: 1 })],
    ["admin", DENY, `${label}: 管理者も消せない`, del(docPath)],
  ];
};

table("サーバー専用（クライアントからは管理者も触れない）", [
  ...lockedDown("rateLimits", "rateLimits/r1"),
  ...lockedDown("auditLogs", "auditLogs/a1"),
  ...lockedDown("config", "config/runtime"),
  ...lockedDown("redeemAttempts", "redeemAttempts/x1"),
]);

table("Rules に書かれていないパス（既定拒否）", [
  ...lockedDown("知らないコレクション", "unknown/x1"),
  ...lockedDown("guests の下の知らないサブコレクション", "guests/u_guest/secret/x1"),
  ...lockedDown("posts の下の知らないサブコレクション", "posts/p_all/secret/x1"),
  ["anon", DENY, "未ログインは知らないコレクションを読めない", get("unknown/x1")],
  ["guest", DENY, "知らないコレクションを横断で一覧できない", (db) => getDocs(query(collectionGroup(db, "secret"), limit(1)))],
  ["admin", DENY, "管理者もいいねを横断で一覧できない", (db) => getDocs(query(collectionGroup(db, "reactions"), limit(1)))],
]);
