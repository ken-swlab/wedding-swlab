/**
 * ご祝儀タブ（/guide/payment）の送金状況と、UI モックで使うダミーの送金先。
 *
 * ★ここの送金先はすべてダミー★ 実在の電話番号・口座・PayPay リンクを書かない。
 *   本物の送金先はリポジトリに置かず、バックエンド連携のときにサーバーから受け取る（Issue #73 はモックだけ）。
 */
export type PaymentStatus = "unpaid" | "pending" | "completed";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "未送金",
  pending: "確認待ち",
  completed: "受領完了",
};

export const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[];

export const DUMMY_PAYMENT = {
  amountYen: 20000,
  /** PayPay の送金リンク（ダミー。example.com は実在のサービスに繋がらない予約ドメイン） */
  paypayUrl: "https://example.com/paypay-dummy",
  /** ことら送金の宛先（ダミー。架空の番号帯） */
  cotraPhone: "090-0000-0000",
  bank: {
    bankName: "サンプル銀行",
    branchName: "本店営業部",
    accountType: "普通",
    accountNumber: "0000000",
    holder: "シンロウ シンプ",
  },
} as const;
