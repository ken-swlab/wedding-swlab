import type { Timestamp } from "firebase/firestore";

export const ATTENDANCE_OPTIONS = [
  { value: "unanswered", label: "未回答" },
  { value: "attending",  label: "出席" },
  { value: "declined",   label: "欠席" },
] as const;
export type Attendance = (typeof ATTENDANCE_OPTIONS)[number]["value"];

export const PAYMENT_OPTIONS = [
  { value: "none",      label: "未" },
  { value: "remitted",  label: "送金報告済" },
  { value: "confirmed", label: "受領確認済" },
] as const;
export type PaymentStatus = (typeof PAYMENT_OPTIONS)[number]["value"];

export const ATTENDANCE_LABEL = Object.fromEntries(
  ATTENDANCE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<Attendance, string>;

export const PAYMENT_LABEL = Object.fromEntries(
  PAYMENT_OPTIONS.map((o) => [o.value, o.label]),
) as Record<PaymentStatus, string>;

/** /guests/{uid} : 全ゲストが読める公開プロフィール */
export type GuestPublic = {
  uid: string;
  /** LINE 側の表示名（変更不可） */
  displayName: string;
  /** システム上で表示する名前。本人が登録フォームで決める */
  nickname: string;
  photoURL?: string;
  tags: string[];
  isApproved: boolean;
  isRegistered: boolean;
};

/** /guestPrivate/{uid} : 本人と管理者だけが読める */
export type GuestPrivate = {
  uid: string;
  attendance: Attendance;
  /** ★健康情報★ 公開プロフィールには絶対に置かない */
  allergy: string;
  paymentStatus: PaymentStatus;
  submittedAt: Timestamp | null;
};

/** /guestAdmin/{uid} : 管理者だけが読める運営メモ */
export type GuestAdmin = {
  uid: string;
  lineUserId: string;
  inviteCode: string;
  inviteLabel: string;
  isAnonymous: boolean;
  aiMemo: string;
  firstLoginAt: Timestamp | null;
};

/** ダッシュボードの1行（3つを uid で結合したもの） */
export type GuestRow = GuestPublic &
  Omit<GuestPrivate, "uid"> &
  Omit<GuestAdmin, "uid">;

/** ゲストが自分で送る初回登録の内容 */
export type RegisterPayload = {
  nickname: string;
  attendance: Attendance;
  allergy: string;
};

/** 管理者が送る更新内容。isApproved はここでしか変えられない */
export type UpdateGuestPayload = {
  uid: string;
  nickname?: string;
  tags?: string[];
  isApproved?: boolean;
  attendance?: Attendance;
  allergy?: string;
  paymentStatus?: PaymentStatus;
  aiMemo?: string;
};
