/**
 * 公式 LINE（Messaging API）から送る通知の文面（Issue #168）。
 *
 * ★文面（テンプレート）と差し込みの値を分ける★ ここは文面だけ。URL などの値は送信係
 *   （src/lib/line-notify-server.ts）が組み立てて渡す。
 * ★本名・アレルギー・出欠などの個人情報を文面に入れない★ 通知は LINE のトーク一覧や
 *   ロック画面にも出る。差し込みに使ってよいのは、誰に見えても困らない値（URL など）だけ。
 * ★新郎新婦の名前・日付・会場を書かない★（公開リポジトリ。CLAUDE.md ルール 4a）
 */

/** 通知の種類。アウトボックス（lineOutbox）の kind と重複防止のキーの先頭に使う */
export type LineNotifyKind = "approved";

/** 「承認されました」（承認したとき。app/api/admin/update-guest） */
export const APPROVED_MESSAGE = {
  /** 通知の一覧（トーク一覧・プッシュ通知）に出る文 */
  altText: "承認されました。ゲストブックが開きました",
  title: "承認されました",
  body: "ゲストブックが開きました。新郎新婦から、思い出の写真が届いています。",
  button: "ゲストブックを開く",
} as const;

/** ボタンの色（ゲストブックの主ボタンと同じ、ほぼ黒） */
const BUTTON_COLOR = "#1c1917";

/**
 * 「承認されました」の Flex Message（ボタン付きのカード）。
 * url … ゲストブックを開く LIFF の URL（送信係が NEXT_PUBLIC_LIFF_ID から組み立てる）
 */
export function approvedFlexMessage(url: string) {
  return {
    type: "flex",
    altText: APPROVED_MESSAGE.altText,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: APPROVED_MESSAGE.title, weight: "bold", size: "lg" },
          { type: "text", text: APPROVED_MESSAGE.body, wrap: true, size: "sm", color: "#57534e" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: BUTTON_COLOR, action: { type: "uri", label: APPROVED_MESSAGE.button, uri: url } },
        ],
      },
    },
  } as const;
}
