/**
 * オープニング演出の名前の表記合わせと、リアクションタイムの表示（Issue #131）。
 *
 * ★このファイルは他のファイルを import しない★
 *   tests/opening-names.test.mjs が Node でそのまま読み込む（`@/` の別名はアプリのビルドでしか解決されない）。
 * ★正規表現に後読みを使わない★（古い Safari）。Unicode のプロパティ（\p{…}）は使ってよい。
 */

/** 新郎新婦の名前の表記。文字の種類（漢字・ひらがな・カタカナ・英字）× フルネームか名前のみ */
export const NAME_STYLES = [
  "kanjiFull",
  "kanjiFirst",
  "hiraFull",
  "hiraFirst",
  "kataFull",
  "kataFirst",
  "latinFull",
  "latinFirst",
] as const;
export type NameStyle = (typeof NAME_STYLES)[number];

/** 表記ごとの [新郎, 新婦]。値は Firestore の config/invitation が持つ */
export type CoupleNames = Record<NameStyle, readonly [groom: string, bride: string]>;

/** 判定できないとき（混在・ニックネーム・空）の表記 */
export const DEFAULT_NAME_STYLE: NameStyle = "kanjiFull";
/** ゲストの名前が空のときの呼び方 */
export const GUEST_FALLBACK_NAME = "あなた";

/** LINE の表示名から絵文字を除き、空白をそろえる */
export function cleanDisplayName(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    // 絵文字をつなぐ文字（ZWJ）・異体字セレクタ・肌の色・国旗の部品
    .replace(/[‍︎️⃣]|[\u{1f3fb}-\u{1f3ff}]|[\u{1f1e6}-\u{1f1ff}]/gu, "")
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ゲストの LINE 名の書き方から、新郎新婦の表記を決める。
 *
 * | LINE 名の書き方                        | 新郎新婦の表記                                  |
 * | 漢字を含み、空白あり または 3文字以上 | 漢字・フルネーム                                |
 * | 漢字2文字以下                          | 漢字・名前のみ                                  |
 * | ひらがなのみ                           | ひらがな（空白ありならフルネーム、なしなら名前のみ） |
 * | カタカナのみ                           | カタカナ（同上）                                |
 * | 英字のみ                               | 英字（同上）                                    |
 * | 判定できない（混在、ニックネームなど） | 漢字・フルネーム                                |
 *
 * matched は判定表のどれかに当たったか（当たらなければ既定の表記）。guest は画面に出すゲストの名前。
 */
export function classifyDisplayName(raw: string | null | undefined): { style: NameStyle; matched: boolean; guest: string } {
  const s = cleanDisplayName(raw);
  if (!s) return { style: DEFAULT_NAME_STYLE, matched: false, guest: GUEST_FALLBACK_NAME };
  const hasSpace = s.includes(" ");
  if (/^[\p{Script=Hiragana}ー ]+$/u.test(s)) return { style: hasSpace ? "hiraFull" : "hiraFirst", matched: true, guest: s };
  if (/^[\p{Script=Katakana}ー・ ]+$/u.test(s)) return { style: hasSpace ? "kataFull" : "kataFirst", matched: true, guest: s };
  if (/^[A-Za-z .'-]+$/.test(s)) return { style: hasSpace ? "latinFull" : "latinFirst", matched: true, guest: s };
  // 漢字を含む名前（送り仮名やかな混じりの名前も含める。例: 「山田 さくら」）
  if (/^[\p{Script=Han}々\p{Script=Hiragana}\p{Script=Katakana}ー ]+$/u.test(s) && /\p{Script=Han}/u.test(s)) {
    const letters = [...s.replace(/ /g, "")].length;
    return { style: hasSpace || letters >= 3 ? "kanjiFull" : "kanjiFirst", matched: true, guest: s };
  }
  return { style: DEFAULT_NAME_STYLE, matched: false, guest: s };
}

/** 表記に合う [新郎, 新婦]。その表記が空なら漢字・フルネームを使う */
export function coupleNamesFor(style: NameStyle, names: CoupleNames): readonly [groom: string, bride: string] {
  const picked = names[style];
  return picked && picked[0] && picked[1] ? picked : names[DEFAULT_NAME_STYLE];
}

/**
 * リアクションタイムの表示。1/100 秒・切り捨て（競泳と同じ）。例: 258ms → "0.25"
 * ★ミリ秒の整数から計算する★ 0.29 * 100 のような小数の掛け算は 28.999… になり、切り捨てで 1 ずれる。
 */
export function formatReaction(reactionMs: number): string {
  const hundredths = Math.floor(Math.max(0, reactionMs) / 10);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

/** オープニングに出す名前一式: [新郎, 新婦]（ゲストの LINE 名の書き方に合わせた表記）と、ゲストの名前 */
export function openingCast(displayName: string | null | undefined, names: CoupleNames): { couple: readonly [string, string]; guestName: string } {
  const c = classifyDisplayName(displayName);
  return { couple: coupleNamesFor(c.style, names), guestName: c.guest };
}
