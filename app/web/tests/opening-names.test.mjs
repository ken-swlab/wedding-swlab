// オープニング演出の名前の表記合わせ（Issue #131）。実行: cd app/web && npm test
// Node が .ts を型だけ落として読み込む（Node 22.18 以上）。アプリのビルドとは別に動く。
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyDisplayName, cleanDisplayName, coupleNamesFor, formatReaction, NAME_STYLES } from "../src/lib/opening-names.ts";

// 架空の名前（試作 docs/prototypes/opening_prototype.html と同じ）
const NAMES = {
  kanjiFull: ["山田 一郎", "山田 花子"],
  kanjiFirst: ["一郎", "花子"],
  hiraFull: ["やまだ いちろう", "やまだ はなこ"],
  hiraFirst: ["いちろう", "はなこ"],
  kataFull: ["ヤマダ イチロウ", "ヤマダ ハナコ"],
  kataFirst: ["イチロウ", "ハナコ"],
  latinFull: ["Ichiro Yamada", "Hanako Yamada"],
  latinFirst: ["Ichiro", "Hanako"],
};

test("判定表: LINE 名の書き方 → 新郎新婦の表記", () => {
  // [LINE 名, 表記, 判定表に当たったか, 画面に出すゲストの名前]
  const cases = [
    // 試作の見本
    ["高橋 太郎", "kanjiFull", true, "高橋 太郎"],
    ["高橋太郎", "kanjiFull", true, "高橋太郎"],
    ["太郎", "kanjiFirst", true, "太郎"],
    ["たかはし たろう", "hiraFull", true, "たかはし たろう"],
    ["たろう", "hiraFirst", true, "たろう"],
    ["タロウ", "kataFirst", true, "タロウ"],
    ["Taro Takahashi", "latinFull", true, "Taro Takahashi"],
    ["taro", "latinFirst", true, "taro"],
    ["🏊たろう🐟", "hiraFirst", true, "たろう"],
    ["いちろうザウルス", "kanjiFull", false, "いちろうザウルス"],
    ["", "kanjiFull", false, "あなた"],
    // 判定表のそのほかの行
    ["タカハシ タロウ", "kataFull", true, "タカハシ タロウ"],
    ["高", "kanjiFirst", true, "高"],
    ["高橋", "kanjiFirst", true, "高橋"],
    ["高橋 太", "kanjiFull", true, "高橋 太"],
    ["佐々木", "kanjiFull", true, "佐々木"],
    ["山田 さくら", "kanjiFull", true, "山田 さくら"],
    ["さくら子", "kanjiFull", true, "さくら子"],
    ["Mary-Jane O'Neil", "latinFull", true, "Mary-Jane O'Neil"],
    // 判定できない（混在・記号・数字）
    ["taro太郎", "kanjiFull", false, "taro太郎"],
    ["たろう2", "kanjiFull", false, "たろう2"],
    ["太郎@東京", "kanjiFull", false, "太郎@東京"],
    // 空白のそろえ（全角・連続・前後）
    ["　高橋　　太郎　", "kanjiFull", true, "高橋 太郎"],
    ["  たろう  ", "hiraFirst", true, "たろう"],
    // 絵文字だけ・未設定
    ["🏊‍♂️🎉", "kanjiFull", false, "あなた"],
    [null, "kanjiFull", false, "あなた"],
    [undefined, "kanjiFull", false, "あなた"],
  ];
  for (const [raw, style, matched, guest] of cases) {
    assert.deepEqual(classifyDisplayName(raw), { style, matched, guest }, `LINE 名: ${JSON.stringify(raw)}`);
  }
});

test("絵文字を除く（つなぎの文字・肌の色・国旗も残さない）", () => {
  assert.equal(cleanDisplayName("👨‍👩‍👧太郎"), "太郎");
  assert.equal(cleanDisplayName("太郎👍🏽"), "太郎");
  assert.equal(cleanDisplayName("🇯🇵 Taro"), "Taro");
  assert.equal(cleanDisplayName("太郎❤️"), "太郎");
});

test("表記に合う新郎新婦の名前を返す", () => {
  for (const style of NAME_STYLES) assert.deepEqual(coupleNamesFor(style, NAMES), NAMES[style]);
  assert.deepEqual(coupleNamesFor(classifyDisplayName("たろう").style, NAMES), ["いちろう", "はなこ"]);
  assert.deepEqual(coupleNamesFor(classifyDisplayName("Taro Takahashi").style, NAMES), ["Ichiro Yamada", "Hanako Yamada"]);
  // その表記が未設定なら、漢字・フルネームで出す
  assert.deepEqual(coupleNamesFor("kataFirst", { ...NAMES, kataFirst: ["", ""] }), NAMES.kanjiFull);
});

test("リアクションタイムは 1/100 秒・切り捨て", () => {
  assert.equal(formatReaction(258), "0.25");
  assert.equal(formatReaction(210), "0.21");
  assert.equal(formatReaction(219), "0.21");
  assert.equal(formatReaction(100), "0.10");
  assert.equal(formatReaction(290), "0.29"); // 0.29 * 100 = 28.999… を切り捨てて 0.28 にしない
  assert.equal(formatReaction(999), "0.99");
  assert.equal(formatReaction(1000), "1.00");
  assert.equal(formatReaction(2999), "2.99");
  assert.equal(formatReaction(3000), "3.00");
});
